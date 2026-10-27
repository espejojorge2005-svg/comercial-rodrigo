import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  ShiftStatus,
  MovementType,
  Product,
  ReceiptType,
  EmissionStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BillingService } from '../../billing/billing.service.js';
import { SalesSequenceService } from './sales-sequence.service.js';
import { SyncOfflineSalesBatchDto } from '../dto/sync-offline-sales.dto.js';
import {
  isValidPeruvianRuc,
  getSunatCompliantEmissionDate,
} from '../utils/sales-fiscal.util.js';

@Injectable()
export class SalesOfflineService {
  private readonly logger = new Logger(SalesOfflineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
    private readonly sequenceService: SalesSequenceService,
  ) {}

  /**
   * Sincronización en lote de ventas procesadas offline (modo sin conexión)
   * Garantiza idempotencia, trazabilidad de Kardex con fecha real y tolerancia a turnos cerrados
   */
  async syncOfflineSales(userId: string, batchDto: SyncOfflineSalesBatchDto) {
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
        // 1. Idempotencia: Verificar si ya fue procesada anteriormente para no duplicar ventas
        const existingKardex = await this.prisma.kardexMovement.findFirst({
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

        // 2. Asociar al turno de caja (incluso si ya fue cerrado posteriormente)
        let targetShift = await this.prisma.cashShift.findUnique({
          where: { id: offlineSale.cashShiftId },
          include: { cashRegister: true },
        });

        if (!targetShift) {
          targetShift = await this.prisma.cashShift.findFirst({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            include: { cashRegister: true },
          });
        }

        if (!targetShift) {
          throw new BadRequestException('No se encontró un turno de caja para asociar la venta offline');
        }

        // 3. Crear venta y movimientos de Kardex
        const txResult = await this.prisma.$transaction(
          async (tx) => {
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

            // 🛡️ CONSOLIDACIÓN DE PRODUCTOS DUPLICADOS & PREVENCIÓN DE DEADLOCKS
            const consolidatedMap = new Map<
              string,
              { productId: string; quantity: number; unitPrice: number }
            >();

            for (const item of offlineSale.items) {
              const qty = Number(item.quantity);
              const price = Number(item.unitPrice);
              if (consolidatedMap.has(item.productId)) {
                const existing = consolidatedMap.get(item.productId)!;
                const newQty = Number((existing.quantity + qty).toFixed(4));
                const prevTotal = existing.quantity * existing.unitPrice;
                const currentTotal = qty * price;
                existing.quantity = newQty;
                existing.unitPrice = Number(((prevTotal + currentTotal) / newQty).toFixed(2));
              } else {
                consolidatedMap.set(item.productId, {
                  productId: item.productId,
                  quantity: qty,
                  unitPrice: price,
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

              if (!product) {
                throw new BadRequestException(`Producto ID ${item.productId} no encontrado`);
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

            // Validar cuadre financiero con tolerancia de redondeo BCRP (S/ 0.10) también en sincronización offline
            const offCash = Number(offlineSale.cashPaid ?? 0);
            const offDigital = Number(offlineSale.digitalPaid ?? 0);
            const offChange = Number(offlineSale.changeAmount ?? 0);
            const offNetPaid = Number(((offCash + offDigital) - offChange).toFixed(2));

            if (Math.abs(offNetPaid - totalCalculated) > 0.10) {
              throw new BadRequestException(
                `Venta offline [${offlineSale.offlineId}] rechazada por descuadre financiero: Importe neto pagado S/ ${offNetPaid.toFixed(2)} difiere del total S/ ${totalCalculated.toFixed(2)} por más de S/ 0.10`,
              );
            }

            const saleDate = offlineSale.createdAt ? new Date(offlineSale.createdAt) : new Date();

            // Si la venta offline solicitó emisión a Boleta o Factura al reconectar, se respeta el tipo destino
            const receiptType =
              offlineSale.targetReceiptType ||
              offlineSale.receiptType ||
              ReceiptType.NOTA_VENTA;

            if (receiptType === ReceiptType.FACTURA) {
              const ruc = (offlineSale.customerDocument || '').trim();
              if (!isValidPeruvianRuc(ruc)) {
                throw new BadRequestException(
                  `Venta offline [${offlineSale.offlineId}] rechazada para Factura: RUC "${ruc}" inválido ante SUNAT (dígito verificador incorrecto).`,
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

            // Trazabilidad de origen offline para auditoría cruzada sin duplicidad
            const offlineTrace = offlineSale.offlineTicketNumber || offlineSale.offlineId;
            const originReason = offlineTrace ? `ORIGEN_OFFLINE:${offlineTrace}` : null;

            // 1. Guardar la venta en base de datos local de forma inmediata (con emisión PENDING si es fiscal)
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
                customerAddress: offlineSale.customerAddress || null,
                customerEmail: offlineSale.customerEmail?.trim() || null,
                hash: null,
                qrString: null,
                emissionStatus: isFiscal ? EmissionStatus.PENDING : null,
                voidedReason: originReason,
                customerName: offlineSale.customerName || 'Cliente Varios',
                customerDocument: offlineSale.customerDocument || null,
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

            // 2. Actualizar stock atómicamente y registrar en Kardex con fecha original
            for (const item of validatedItems) {
              const updatedProduct = await tx.product.update({
                where: { id: item.product.id },
                data: {
                  currentStock: { decrement: new Prisma.Decimal(item.quantity) },
                },
              });

              await tx.kardexMovement.create({
                data: {
                  productId: item.product.id,
                  movementType: MovementType.SALE,
                  quantity: new Prisma.Decimal(item.quantity),
                  previousStock: new Prisma.Decimal(Number(updatedProduct.currentStock) + item.quantity),
                  newStock: updatedProduct.currentStock,
                  unitCost: item.product.costPrice,
                  referenceId: sale.id,
                  reason: `Venta POS Offline #${sale.saleNumber} [OFFLINE:${offlineSale.offlineId}] - ${targetShift.cashRegister.name}`,
                  userId,
                  createdAt: saleDate,
                },
              });
            }

            // 3. Si el turno ya fue cerrado previamente, reconciliar retroactivamente el arqueo físico
            if (targetShift.status === ShiftStatus.CLOSED) {
              const netCash =
                sale.paymentMethod === 'TRANSFER' || sale.paymentMethod === 'CARD'
                  ? 0
                  : Math.max(0, Number(sale.cashPaid) - Number(sale.changeAmount || 0));

              if (netCash > 0) {
                await tx.cashShift.update({
                  where: { id: targetShift.id },
                  data: {
                    expectedBalance: { increment: new Prisma.Decimal(netCash) },
                    ...(targetShift.difference !== null
                      ? { difference: { decrement: new Prisma.Decimal(netCash) } }
                      : {}),
                  },
                });
              }
            }

            return {
              sale,
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
          { timeout: 10000 },
        );

        // =========================================================================
        // ETAPA 2: INTEGRACIÓN CON MOTOR DE FACTURACIÓN (FUERA DE LA TRANSACCIÓN DB)
        // =========================================================================
        let finalSale: any = txResult.sale;

        if (txResult.isFiscal) {
          const storeConfig = await this.prisma.storeConfig.findFirst();
          try {
            const sunatDateCheck = getSunatCompliantEmissionDate(txResult.saleDate);
            const effectiveCreatedAt = sunatDateCheck.emissionDate;

            if (sunatDateCheck.wasAdjusted) {
              await this.prisma.sale.update({
                where: { id: txResult.sale.id },
                data: {
                  createdAt: effectiveCreatedAt,
                  voidedReason: `CONTINGENCIA_OFFLINE: Fecha ajustada de ${sunatDateCheck.originalDateString} a actual por superar plazo de 1 día calendario SUNAT (R.S. 000003-2023)`,
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
              finalSale = await this.prisma.sale.update({
                where: { id: txResult.sale.id },
                data: {
                  emissionStatus: EmissionStatus.REJECTED,
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
                `[syncOfflineSales] Rechazado por PSE: Boleta/Factura offline [${offlineSale.offlineId}] falló validación SUNAT: ${billingRes.message}`,
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
            items: finalSale.items.map((i: any) => ({
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
      throw new BadRequestException('Esta venta es una Nota de Venta interna; no requiere emisión ante SUNAT');
    }

    if (sale.emissionStatus === EmissionStatus.ACCEPTED) {
      return { success: true, message: 'El comprobante ya fue emitido y aceptado por SUNAT previamente', sale };
    }

    const sunatDateCheck = getSunatCompliantEmissionDate(sale.createdAt);
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

      return { success: true, message: 'Comprobante emitido exitosamente ante SUNAT', sale: updatedSale };
    } else {
      const finalStatus = billingRes.emissionStatus === 'PENDING' ? EmissionStatus.PENDING : EmissionStatus.REJECTED;
      await this.prisma.sale.update({
        where: { id: sale.id },
        data: {
          emissionStatus: finalStatus,
        },
      });
      return { success: false, message: `Error en emisión: ${billingRes.message}`, error: billingRes.message };
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
      select: { id: true, fullReceiptNumber: true },
    });

    const results = [];
    for (const s of pendingSales) {
      try {
        const res = await this.reemitPendingSale(s.id);
        results.push({ id: s.id, receiptNumber: s.fullReceiptNumber, success: res.success, message: res.message });
      } catch (err: any) {
        results.push({ id: s.id, receiptNumber: s.fullReceiptNumber, success: false, message: err.message });
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
