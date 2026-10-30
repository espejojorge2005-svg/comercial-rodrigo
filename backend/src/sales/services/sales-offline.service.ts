import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ShiftStatus,
  MovementType,
  Product,
  ReceiptType,
  EmissionStatus,
  Role,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BillingService } from '../../billing/billing.service.js';
import { SalesSequenceService } from './sales-sequence.service.js';
import { SyncOfflineSalesBatchDto } from '../dto/sync-offline-sales.dto.js';
import {
  getSunatCompliantEmissionDate,
  isDiscreteUnit,
  validateFiscalCustomerAndPayment,
} from '../utils/sales-fiscal.util.js';

@Injectable()
export class SalesOfflineService {
  private readonly logger = new Logger(SalesOfflineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
    private readonly sequenceService: SalesSequenceService,
  ) {}

  private async verifyOfflineAdminPin(pin?: string): Promise<{ id: string; name: string } | null> {
    if (!pin || !pin.trim() || !this.prisma?.user) return null;
    const cleanPin = pin.trim();
    const admins = this.prisma.user.findMany
      ? await this.prisma.user.findMany({
          where: { role: Role.ADMIN, isActive: true, pin: { not: null } },
          select: { id: true, name: true, pin: true },
        })
      : [];

    for (const a of admins) {
      if (!a.pin) continue;
      const isBcrypt =
        a.pin.startsWith('$2a$') || a.pin.startsWith('$2b$') || a.pin.startsWith('$2y$');
      const matches = isBcrypt ? await bcrypt.compare(cleanPin, a.pin) : a.pin === cleanPin;
      if (matches) return { id: a.id, name: a.name };
    }
    return null;
  }

  /**
   * Sincronización en lote de ventas procesadas offline (modo sin conexión)
   * Garantiza idempotencia transaccional, Zero-Trust Pricing, control ACID de stock y reglas SUNAT.
   */
  async syncOfflineSales(
    userId: string,
    batchDto: SyncOfflineSalesBatchDto,
    userRole?: Role,
  ) {
    if (!batchDto.sales || batchDto.sales.length === 0) {
      return {
        message: 'No hay ventas offline para sincronizar',
        total: 0,
        syncedCount: 0,
        failedCount: 0,
        results: [],
      };
    }

    const results: {
      offlineId: string;
      success: boolean;
      sale?: any;
      error?: string;
    }[] = [];

    for (const offlineSale of batchDto.sales) {
      try {
        if (!offlineSale.items || offlineSale.items.length === 0) {
          throw new BadRequestException(
            `Venta offline [${offlineSale.offlineId}] rechazada: no contiene productos.`,
          );
        }

        // 1. Idempotencia preliminar antes de abrir transacción
        const existingKardex = await this.prisma.kardexMovement?.findFirst?.({
          where: {
            reason: { contains: `[OFFLINE:${offlineSale.offlineId}]` },
          },
        });

        if (existingKardex && existingKardex.referenceId) {
          const existingSale = await this.prisma.sale.findUnique({
            where: { id: existingKardex.referenceId },
            include: {
              items: {
                include: {
                  product: {
                    select: { id: true, name: true, barcode: true, unitType: true },
                  },
                },
              },
              cashShift: {
                include: { cashRegister: true },
              },
              user: {
                select: { id: true, name: true, username: true },
              },
            },
          });

          if (existingSale) {
            results.push({
              offlineId: offlineSale.offlineId,
              success: true,
              sale: {
                ...existingSale,
                totalAmount: Number(existingSale.totalAmount),
                cashPaid: Number(existingSale.cashPaid),
                digitalPaid: Number(existingSale.digitalPaid),
                changeAmount: Number(existingSale.changeAmount),
                items: existingSale.items.map((i) => ({
                  ...i,
                  quantity: Number(i.quantity),
                  unitPrice: Number(i.unitPrice),
                  subtotal: Number(i.subtotal),
                })),
              },
            });
            continue;
          }
        }

        // 2. Asociar al turno de caja verificando titularidad
        let targetShift = await this.prisma.cashShift.findUnique({
          where: { id: offlineSale.cashShiftId },
          include: { cashRegister: true },
        });

        if (
          targetShift &&
          targetShift.userId &&
          userRole &&
          userRole !== Role.ADMIN &&
          targetShift.userId !== userId
        ) {
          throw new ForbiddenException(
            `Venta offline [${offlineSale.offlineId}] rechazada: el turno pertenece a otro usuario.`,
          );
        }

        if (!targetShift) {
          targetShift = await this.prisma.cashShift.findFirst({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            include: { cashRegister: true },
          });
        }

        if (!targetShift) {
          throw new BadRequestException(
            'No se encontró un turno de caja para asociar la venta offline',
          );
        }

        // Pre-validar PIN si viene incluido (fuera de tx para no contaminar transacción SQL)
        const authorizedAdmin = offlineSale.adminPin
          ? await this.verifyOfflineAdminPin(offlineSale.adminPin)
          : null;

        // 3. Crear venta y movimientos de Kardex en transacción ACID
        const txResult = await this.prisma.$transaction(
          async (tx) => {
            // Bloqueo consultivo transaccional por offlineId contra doble envío paralelo al reconectar
            if (typeof (tx as any).$executeRaw === 'function') {
              await (tx as any).$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${offlineSale.offlineId}))`;
            }

            if (typeof tx.kardexMovement?.findFirst === 'function') {
              const dupInTx = await tx.kardexMovement.findFirst({
                where: { reason: { contains: `[OFFLINE:${offlineSale.offlineId}]` } },
              });
              if (dupInTx?.referenceId && typeof tx.sale?.findUnique === 'function') {
                const dupSale = await tx.sale.findUnique({
                  where: { id: dupInTx.referenceId },
                  include: {
                    items: {
                      include: {
                        product: {
                          select: { id: true, name: true, barcode: true, unitType: true },
                        },
                      },
                    },
                    cashShift: { include: { cashRegister: true } },
                    user: { select: { id: true, name: true, username: true } },
                  },
                });
                if (dupSale) {
                  return {
                    sale: dupSale,
                    alreadyExisted: true,
                    isFiscal: false,
                    receiptType: dupSale.receiptType,
                    series: dupSale.series,
                    correlativeNumber: dupSale.correlativeNumber,
                    totalCalculated: Number(dupSale.totalAmount),
                    taxableBase: Number(dupSale.taxableBase),
                    igvAmount: Number(dupSale.igvAmount),
                    validatedItems: [],
                    saleDate: dupSale.createdAt,
                  };
                }
              }
            }

            let totalCalculated = 0;
            let totalTaxableBase = 0;
            let totalIgv = 0;
            const detailsToCreate: {
              productId: string;
              quantity: Prisma.Decimal;
              unitPrice: Prisma.Decimal;
              subtotal: Prisma.Decimal;
              costPriceSnapshot: Prisma.Decimal;
            }[] = [];

            const validatedItems: {
              product: Product;
              quantity: number;
              unitPrice: number;
              subtotalItem: number;
            }[] = [];

            // Consolidación de productos duplicados y orden determinista contra deadlocks
            const consolidatedMap = new Map<
              string,
              {
                productId: string;
                quantity: number;
                unitPrice: number;
                isWholesaleApplied: boolean;
              }
            >();

            for (const item of offlineSale.items) {
              const qty = Number(item.quantity);
              const price = Number(item.unitPrice);
              if (qty <= 0 || Number.isNaN(qty)) {
                throw new BadRequestException('La cantidad de cada ítem offline debe ser mayor a 0');
              }
              if (price <= 0 || Number.isNaN(price)) {
                throw new BadRequestException('El precio unitario offline debe ser mayor a 0');
              }

              if (consolidatedMap.has(item.productId)) {
                const existing = consolidatedMap.get(item.productId)!;
                const newQty = Number((existing.quantity + qty).toFixed(4));
                const prevTotal = existing.quantity * existing.unitPrice;
                const currentTotal = qty * price;
                existing.quantity = newQty;
                existing.unitPrice = Number(((prevTotal + currentTotal) / newQty).toFixed(2));
                existing.isWholesaleApplied =
                  existing.isWholesaleApplied || Boolean(item.isWholesaleApplied);
              } else {
                consolidatedMap.set(item.productId, {
                  productId: item.productId,
                  quantity: qty,
                  unitPrice: price,
                  isWholesaleApplied: Boolean(item.isWholesaleApplied),
                });
              }
            }

            const consolidatedOfflineItems = Array.from(consolidatedMap.values()).sort((a, b) =>
              a.productId.localeCompare(b.productId),
            );

            for (const item of consolidatedOfflineItems) {
              const product = await tx.product.findUnique({
                where: { id: item.productId },
              });

              if (!product || !product.isActive) {
                throw new BadRequestException(
                  `Producto ID ${item.productId} no encontrado o se encuentra inactivo`,
                );
              }

              if (product.unitType && isDiscreteUnit(product.unitType) && !Number.isInteger(item.quantity)) {
                throw new BadRequestException(
                  `El producto "${product.name}" se vende por unidad entera (${product.unitType}) y no admite cantidades decimales (${item.quantity}).`,
                );
              }

              const availableStock = Number(product.currentStock);
              if (availableStock < item.quantity) {
                throw new BadRequestException(
                  `Stock insuficiente en almacén para sincronizar "${product.name}". Solicitado: ${item.quantity}, Disponible: ${availableStock}`,
                );
              }

              // 🛡️ ZERO-TRUST PRICING también en ventas offline
              const retailPriceNum =
                product.retailPrice !== undefined && product.retailPrice !== null
                  ? Number(product.retailPrice)
                  : null;

              if (retailPriceNum !== null) {
                const wholesalePriceNum =
                  product.wholesalePrice !== undefined && product.wholesalePrice !== null
                    ? Number(product.wholesalePrice)
                    : null;
                const wholesaleMinQtyNum =
                  product.wholesaleMinQty !== undefined && product.wholesaleMinQty !== null
                    ? Number(product.wholesaleMinQty)
                    : 3;

                let officialPrice = retailPriceNum;
                if (
                  wholesalePriceNum !== null &&
                  wholesalePriceNum > 0 &&
                  (item.isWholesaleApplied || item.quantity >= wholesaleMinQtyNum)
                ) {
                  officialPrice = wholesalePriceNum;
                }

                if (item.unitPrice < officialPrice - 0.01) {
                  if (!offlineSale.adminPin || !offlineSale.adminPin.trim()) {
                    throw new BadRequestException(
                      `Venta offline [${offlineSale.offlineId}] rechazada: precio S/ ${item.unitPrice.toFixed(2)} menor al catálogo S/ ${officialPrice.toFixed(2)} en "${product.name}" sin PIN de Administrador.`,
                    );
                  }
                  if (!authorizedAdmin) {
                    throw new ForbiddenException(
                      'PIN de Administrador inválido en venta offline con descuento.',
                    );
                  }
                }
              }

              const subtotalItem = Number((item.quantity * item.unitPrice).toFixed(2));
              const itemValorTotal = Number((subtotalItem / 1.18).toFixed(2));
              const itemIgv = Number((subtotalItem - itemValorTotal).toFixed(2));

              totalCalculated += subtotalItem;
              totalTaxableBase += itemValorTotal;
              totalIgv += itemIgv;

              detailsToCreate.push({
                productId: product.id,
                quantity: new Prisma.Decimal(item.quantity),
                unitPrice: new Prisma.Decimal(item.unitPrice),
                subtotal: new Prisma.Decimal(subtotalItem),
                costPriceSnapshot: product.costPrice,
              });

              validatedItems.push({
                product,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                subtotalItem,
              });
            }

            totalCalculated = Number(totalCalculated.toFixed(2));
            totalTaxableBase = Number(totalTaxableBase.toFixed(2));
            totalIgv = Number(totalIgv.toFixed(2));
            const totalAmountDecimal = new Prisma.Decimal(totalCalculated);

            // Validar cuadre financiero y reglas antifraude de métodos de pago
            const offCash = Number(offlineSale.cashPaid ?? 0);
            const offDigital = Number(offlineSale.digitalPaid ?? 0);
            const offChange = Number(offlineSale.changeAmount ?? 0);
            const offNetPaid = Number((offCash + offDigital - offChange).toFixed(2));

            if (Math.abs(offNetPaid - totalCalculated) > 0.1) {
              throw new BadRequestException(
                `Venta offline [${offlineSale.offlineId}] rechazada por descuadre financiero: Importe neto pagado S/ ${offNetPaid.toFixed(2)} difiere del total S/ ${totalCalculated.toFixed(2)} por más de S/ 0.10`,
              );
            }

            if (offlineSale.paymentMethod === 'CASH' && offDigital > 0) {
              throw new BadRequestException(
                `Venta offline [${offlineSale.offlineId}] inválida: pago en EFECTIVO no admite monto digital.`,
              );
            } else if (
              offlineSale.paymentMethod === 'TRANSFER' ||
              offlineSale.paymentMethod === 'CARD'
            ) {
              if (offCash > 0 || offChange > 0 || Math.abs(offDigital - totalCalculated) > 0.01) {
                throw new BadRequestException(
                  `Venta offline [${offlineSale.offlineId}] inválida: pago digital debe coincidir exactamente con el total sin efectivo ni vuelto.`,
                );
              }
            } else if (offlineSale.paymentMethod === 'MIXED') {
              if (offChange > offCash || offDigital > totalCalculated) {
                throw new BadRequestException(
                  `Venta offline [${offlineSale.offlineId}] inválida: en pago MIXTO el vuelto no puede superar al efectivo ni el digital al total.`,
                );
              }
            }

            const parsedDate = offlineSale.createdAt ? new Date(offlineSale.createdAt) : new Date();
            const saleDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

            const receiptType =
              offlineSale.targetReceiptType ||
              offlineSale.receiptType ||
              ReceiptType.NOTA_VENTA;

            const cleanCustomerDoc = (offlineSale.customerDocument || '').trim();
            const cleanCustomerName = (offlineSale.customerName || '').trim();
            const cleanCustomerAddress = (offlineSale.customerAddress || '').trim();

            if (receiptType !== ReceiptType.NOTA_VENTA) {
              const fiscalCheck = validateFiscalCustomerAndPayment({
                receiptType,
                totalAmount: totalCalculated,
                paymentMethod: offlineSale.paymentMethod,
                cashPaid: offCash,
                customerDocument: cleanCustomerDoc,
                customerName: cleanCustomerName,
                customerAddress: cleanCustomerAddress,
                customerEmail: offlineSale.customerEmail,
              });
              if (!fiscalCheck.valid) {
                throw new BadRequestException(
                  `Venta offline [${offlineSale.offlineId}] rechazada por validación fiscal SUNAT: ${fiscalCheck.message}`,
                );
              }
            }

            const isFiscal = receiptType !== ReceiptType.NOTA_VENTA;
            const taxableBase = totalTaxableBase;
            const igvAmount = isFiscal ? totalIgv : 0;

            const series = await this.sequenceService.getOrAllocateSeries(
              tx,
              targetShift.cashRegisterId,
              targetShift.cashRegister.identifier,
              targetShift.cashRegister.name,
              receiptType,
            );

            const sequence = await tx.receiptSequence.upsert({
              where: { series },
              create: {
                cashRegisterId: targetShift.cashRegisterId,
                receiptType,
                series,
                currentNumber: 1,
              },
              update: {
                currentNumber: { increment: 1 },
              },
            });

            const correlativeNumber = sequence.currentNumber;
            const fullReceiptNumber = `${series}-${String(correlativeNumber).padStart(8, '0')}`;

            const offlineTrace = offlineSale.offlineTicketNumber || offlineSale.offlineId;
            const originReason = offlineTrace ? `ORIGEN_OFFLINE:${offlineTrace}` : null;

            const sale = await tx.sale.create({
              data: {
                cashShiftId: targetShift.id,
                userId,
                receiptType,
                series,
                correlativeNumber,
                fullReceiptNumber,
                isFiscal,
                taxableBase: new Prisma.Decimal(taxableBase),
                igvAmount: new Prisma.Decimal(igvAmount),
                customerAddress: cleanCustomerAddress || null,
                customerEmail: offlineSale.customerEmail?.trim() || null,
                hash: null,
                qrString: null,
                emissionStatus: isFiscal ? EmissionStatus.PENDING : null,
                voidedReason: originReason,
                customerName: cleanCustomerName || 'Cliente Varios',
                customerDocument: cleanCustomerDoc || null,
                paymentMethod: offlineSale.paymentMethod,
                cashPaid: new Prisma.Decimal(offlineSale.cashPaid),
                digitalPaid: new Prisma.Decimal(offlineSale.digitalPaid),
                totalAmount: totalAmountDecimal,
                changeAmount: new Prisma.Decimal(offlineSale.changeAmount),
                createdAt: saleDate,
                items: {
                  create: detailsToCreate,
                },
              },
              include: {
                items: {
                  include: {
                    product: {
                      select: { id: true, name: true, barcode: true, unitType: true },
                    },
                  },
                },
                cashShift: {
                  include: { cashRegister: true },
                },
                user: {
                  select: { id: true, name: true, username: true },
                },
              },
            });

            // 2. Descontar stock de forma atómica verificando saldo >= cantidad
            for (const item of validatedItems) {
              const qtyDec = new Prisma.Decimal(item.quantity);
              let newStockDecimal: Prisma.Decimal;

              if (typeof tx.product.updateMany === 'function') {
                const upd = await tx.product.updateMany({
                  where: {
                    id: item.product.id,
                    currentStock: { gte: qtyDec },
                  },
                  data: {
                    currentStock: { decrement: qtyDec },
                  },
                });
                if (upd.count === 0) {
                  throw new BadRequestException(
                    `Stock insuficiente en concurrencia al sincronizar "${item.product.name}".`,
                  );
                }
                const freshProd = await tx.product.findUnique({
                  where: { id: item.product.id },
                });
                newStockDecimal = freshProd
                  ? freshProd.currentStock
                  : new Prisma.Decimal(Number(item.product.currentStock) - item.quantity);
              } else {
                const updatedProduct = await tx.product.update({
                  where: { id: item.product.id },
                  data: {
                    currentStock: { decrement: qtyDec },
                  },
                });
                newStockDecimal = updatedProduct.currentStock;
              }

              await tx.kardexMovement.create({
                data: {
                  productId: item.product.id,
                  movementType: MovementType.SALE,
                  quantity: qtyDec,
                  previousStock: new Prisma.Decimal(Number(newStockDecimal) + item.quantity),
                  newStock: newStockDecimal,
                  unitCost: item.product.costPrice,
                  referenceId: sale.id,
                  reason: `Venta POS Offline #${sale.saleNumber} [OFFLINE:${offlineSale.offlineId}] - ${targetShift.cashRegister.name}`,
                  userId,
                  createdAt: saleDate,
                },
              });
            }

            // 3. Si el turno ya fue cerrado, reconciliar dejando rastro explícito de auditoría en notes
            if (targetShift.status === ShiftStatus.CLOSED && tx.cashShift?.update) {
              const netCash =
                sale.paymentMethod === 'TRANSFER' || sale.paymentMethod === 'CARD'
                  ? 0
                  : Math.max(0, Number(sale.cashPaid) - Number(sale.changeAmount || 0));

              if (netCash > 0) {
                const auditTag = `[SYNC_OFFLINE_POST_CIERRE ${fullReceiptNumber}: +S/ ${netCash.toFixed(2)}]`;
                const prevNotes = targetShift.notes ? `${targetShift.notes} | ` : '';
                await tx.cashShift.update({
                  where: { id: targetShift.id },
                  data: {
                    expectedBalance: { increment: new Prisma.Decimal(netCash) },
                    ...(targetShift.difference !== null && targetShift.difference !== undefined
                      ? { difference: { decrement: new Prisma.Decimal(netCash) } }
                      : {}),
                    notes: `${prevNotes}${auditTag}`,
                  },
                });
              }
            }

            return {
              sale,
              alreadyExisted: false,
              isFiscal,
              receiptType,
              series,
              correlativeNumber,
              totalCalculated,
              taxableBase,
              igvAmount,
              validatedItems,
              saleDate,
            };
          },
          { timeout: 15000 },
        );

        let finalSale: any = txResult.sale;

        if (!txResult.alreadyExisted && txResult.isFiscal) {
          const storeConfig = await this.prisma.storeConfig?.findFirst?.();
          try {
            // Respetar orden cronológico respecto al correlativo anterior de la misma serie
            const previousInSeries = await this.prisma.sale?.findFirst?.({
              where: {
                series: txResult.series,
                correlativeNumber: { lt: txResult.correlativeNumber },
              },
              orderBy: { correlativeNumber: 'desc' },
              select: { createdAt: true },
            });

            const sunatDateCheck = getSunatCompliantEmissionDate(
              txResult.saleDate,
              previousInSeries?.createdAt || null,
            );
            const effectiveCreatedAt = sunatDateCheck.emissionDate;

            if (sunatDateCheck.wasAdjusted) {
              await this.prisma.sale.update({
                where: { id: txResult.sale.id },
                data: {
                  createdAt: effectiveCreatedAt,
                  voidedReason: `CONTINGENCIA_OFFLINE: Fecha ajustada de ${sunatDateCheck.originalDateString} a ${effectiveCreatedAt.toISOString()} por plazo/cronología SUNAT (R.S. 000003-2023)`,
                },
              });
            }

            const billingRes = await this.billingService.issueReceipt({
              receiptType: txResult.receiptType as 'BOLETA' | 'FACTURA',
              series: txResult.series,
              correlativeNumber: txResult.correlativeNumber,
              totalAmount: txResult.totalCalculated,
              taxableBase: txResult.taxableBase,
              igvAmount: txResult.igvAmount,
              customerName: offlineSale.customerName || 'CLIENTES VARIOS',
              customerDocument: offlineSale.customerDocument,
              customerAddress: offlineSale.customerAddress,
              customerEmail: offlineSale.customerEmail?.trim() || null,
              paymentMethod: offlineSale.paymentMethod,
              companyRuc: storeConfig?.ruc || '10458923011',
              items: txResult.validatedItems.map((vi: any) => ({
                name: vi.product.name,
                quantity: vi.quantity,
                unitPrice: vi.unitPrice,
                subtotal: vi.subtotalItem,
                unitType: vi.product.unitType,
                barcode: vi.product.barcode,
              })),
              createdAt: effectiveCreatedAt,
            });

            if (billingRes.success) {
              const finalEmissionStatus =
                (billingRes.emissionStatus as EmissionStatus) || EmissionStatus.ACCEPTED;

              finalSale = await this.prisma.sale.update({
                where: { id: txResult.sale.id },
                data: {
                  hash: billingRes.hash,
                  qrString: billingRes.qrString,
                  emissionStatus: finalEmissionStatus,
                  externalId: billingRes.externalId || null,
                  pdfUrl: billingRes.pdfUrl || null,
                  xmlUrl: billingRes.xmlUrl || null,
                  cdrUrl: billingRes.cdrUrl || null,
                } as any,
                include: {
                  items: {
                    include: {
                      product: {
                        select: { id: true, name: true, barcode: true, unitType: true },
                      },
                    },
                  },
                  cashShift: {
                    include: { cashRegister: true },
                  },
                  user: {
                    select: { id: true, name: true, username: true },
                  },
                },
              });
            } else {
              // Preservar PENDING ante caídas temporales de red; marcar REJECTED solo ante rechazo formal del PSE/SUNAT
              const targetStatus =
                billingRes.emissionStatus === 'PENDING'
                  ? EmissionStatus.PENDING
                  : EmissionStatus.REJECTED;

              finalSale = await this.prisma.sale.update({
                where: { id: txResult.sale.id },
                data: {
                  emissionStatus: targetStatus,
                },
                include: {
                  items: {
                    include: {
                      product: {
                        select: { id: true, name: true, barcode: true, unitType: true },
                      },
                    },
                  },
                  cashShift: {
                    include: { cashRegister: true },
                  },
                  user: {
                    select: { id: true, name: true, username: true },
                  },
                },
              });
              this.logger.error(
                `[syncOfflineSales] ${targetStatus === EmissionStatus.PENDING ? 'Contingencia PSE' : 'Rechazado por PSE'}: Boleta/Factura offline [${offlineSale.offlineId}]: ${billingRes.message}`,
              );
            }
          } catch (billingErr: any) {
            this.logger.error(
              `[syncOfflineSales] Error de facturación para venta offline [${offlineSale.offlineId}]: ${billingErr.message}. La venta se preserva localmente con estado PENDING.`,
            );
          }
        }

        results.push({
          offlineId: offlineSale.offlineId,
          success: true,
          sale: {
            ...finalSale,
            totalAmount: Number(finalSale.totalAmount),
            taxableBase: Number(finalSale.taxableBase),
            igvAmount: Number(finalSale.igvAmount),
            cashPaid: Number(finalSale.cashPaid),
            digitalPaid: Number(finalSale.digitalPaid),
            changeAmount: Number(finalSale.changeAmount),
            items: (finalSale.items || []).map((i: any) => ({
              ...i,
              quantity: Number(i.quantity),
              unitPrice: Number(i.unitPrice),
              subtotal: Number(i.subtotal),
            })),
          },
        });
      } catch (err: any) {
        results.push({
          offlineId: offlineSale.offlineId,
          success: false,
          error: err.message || 'Error al procesar venta offline',
        });
      }
    }

    return {
      message: `Procesadas ${results.length} ventas offline`,
      total: results.length,
      syncedCount: results.filter((r) => r.success).length,
      failedCount: results.filter((r) => !r.success).length,
      results,
    };
  }

  /**
   * 🛡️ REEMISIÓN SEGURA DE COMPROBANTES PENDING (RESIDUAL DE CONTINGENCIA O CORTE DE RED)
   */
  async reemitPendingSale(saleId: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, barcode: true, unitType: true },
            },
          },
        },
        cashShift: {
          include: { cashRegister: true },
        },
      },
    });

    if (!sale) {
      throw new NotFoundException(`Venta con ID ${saleId} no encontrada`);
    }

    if (!sale.isFiscal) {
      throw new BadRequestException(
        'Esta venta es una Nota de Venta interna; no requiere emisión ante SUNAT',
      );
    }

    if (
      sale.emissionStatus === EmissionStatus.ACCEPTED ||
      sale.emissionStatus === EmissionStatus.SIMULATED
    ) {
      return {
        success: true,
        message: 'El comprobante ya fue emitido previamente',
        sale,
      };
    }

    const previousInSeries = await this.prisma.sale?.findFirst?.({
      where: {
        series: sale.series,
        correlativeNumber: { lt: sale.correlativeNumber },
      },
      orderBy: { correlativeNumber: 'desc' },
      select: { createdAt: true },
    });

    const sunatDateCheck = getSunatCompliantEmissionDate(
      sale.createdAt,
      previousInSeries?.createdAt || null,
    );
    const effectiveDate = sunatDateCheck.emissionDate;

    if (sunatDateCheck.wasAdjusted) {
      await this.prisma.sale.update({
        where: { id: sale.id },
        data: {
          createdAt: effectiveDate,
          voidedReason: `REEMISION_PENDIENTE: Fecha ajustada de ${sunatDateCheck.originalDateString} a actual para evitar Error 2324 SUNAT`,
        },
      });
    }

    const storeConfig = await this.prisma.storeConfig.findFirst();

    const billingRes = await this.billingService.issueReceipt({
      receiptType: sale.receiptType as 'BOLETA' | 'FACTURA',
      series: sale.series,
      correlativeNumber: sale.correlativeNumber,
      totalAmount: Number(sale.totalAmount),
      taxableBase: Number(sale.taxableBase),
      igvAmount: Number(sale.igvAmount),
      customerName: sale.customerName || 'CLIENTES VARIOS',
      customerDocument: sale.customerDocument || undefined,
      customerAddress: sale.customerAddress || undefined,
      customerEmail: sale.customerEmail || undefined,
      paymentMethod: sale.paymentMethod,
      companyRuc: storeConfig?.ruc || '10458923011',
      items: sale.items.map((item) => ({
        name: item.product.name,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        subtotal: Number(item.subtotal),
        unitType: item.product.unitType,
        barcode: item.product.barcode,
      })),
      createdAt: effectiveDate,
    });

    if (billingRes.success) {
      const finalStatus = (billingRes.emissionStatus as EmissionStatus) || EmissionStatus.ACCEPTED;
      const updatedSale = await this.prisma.sale.update({
        where: { id: sale.id },
        data: {
          hash: billingRes.hash,
          qrString: billingRes.qrString,
          emissionStatus: finalStatus,
          externalId: billingRes.externalId || null,
          pdfUrl: billingRes.pdfUrl || null,
          xmlUrl: billingRes.xmlUrl || null,
          cdrUrl: billingRes.cdrUrl || null,
        } as any,
        include: {
          items: {
            include: {
              product: {
                select: { id: true, name: true, barcode: true, unitType: true },
              },
            },
          },
          cashShift: {
            include: { cashRegister: true },
          },
        },
      });

      return {
        success: true,
        message: 'Comprobante emitido exitosamente ante SUNAT',
        sale: updatedSale,
      };
    } else {
      const finalStatus =
        billingRes.emissionStatus === 'PENDING'
          ? EmissionStatus.PENDING
          : EmissionStatus.REJECTED;
      await this.prisma.sale.update({
        where: { id: sale.id },
        data: {
          emissionStatus: finalStatus,
        },
      });
      return {
        success: false,
        message: `Error en emisión: ${billingRes.message}`,
        error: billingRes.message,
      };
    }
  }

  /**
   * Reenvío en lote de todos los comprobantes PENDING con corte de plazo SUNAT
   */
  async reemitPendingBatch() {
    const pendingSales = await this.prisma.sale.findMany({
      where: {
        isFiscal: true,
        emissionStatus: EmissionStatus.PENDING,
      },
      orderBy: [{ series: 'asc' }, { correlativeNumber: 'asc' }],
      select: { id: true, fullReceiptNumber: true },
    });

    const results = [];
    for (const s of pendingSales) {
      try {
        const res = await this.reemitPendingSale(s.id);
        results.push({
          id: s.id,
          receiptNumber: s.fullReceiptNumber,
          success: res.success,
          message: res.message,
        });
      } catch (err: any) {
        results.push({
          id: s.id,
          receiptNumber: s.fullReceiptNumber,
          success: false,
          message: err.message,
        });
      }
    }

    return {
      totalFound: pendingSales.length,
      processed: results.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      details: results,
    };
  }
}
