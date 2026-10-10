import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, ShiftStatus, MovementType, Role, Product, CashMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateSaleDto } from './dto/create-sale.dto.js';
import { VoidSaleDto } from './dto/void-sale.dto.js';
import { SyncOfflineSalesBatchDto } from './dto/sync-offline-sales.dto.js';

@Injectable()
export class SalesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Registro atómico de venta en POS con CONTROL DE CONCURRENCIA ACID y Kardex
   */
  async createSale(userId: string, dto: CreateSaleDto) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('La venta debe incluir al menos un producto');
    }

    // 1. Validar que el turno de caja esté ABIERTO
    const shift = await this.prisma.cashShift.findUnique({
      where: { id: dto.cashShiftId },
      include: { cashRegister: true },
    });

    if (!shift || shift.status !== ShiftStatus.OPEN) {
      throw new BadRequestException('El turno de caja especificado no está abierto');
    }

    // 2. Ejecutar toda la venta en una transacción ACID atómica
    return this.prisma.$transaction(
      async (tx) => {
        let totalCalculated = 0;
        const detailsToCreate: {
          productId: string;
          quantity: Prisma.Decimal;
          unitPrice: Prisma.Decimal;
          subtotal: Prisma.Decimal;
          costPriceSnapshot: Prisma.Decimal;
        }[] = [];

        // 1. Validar existencias de stock y preparar detalles de la venta
        const validatedItems: {
          product: Product;
          quantity: number;
          unitPrice: number;
          subtotalItem: number;
        }[] = [];

        for (const item of dto.items) {
          const product = await tx.product.findUnique({
            where: { id: item.productId },
          });

          if (!product || !product.isActive) {
            throw new BadRequestException(
              `El producto con ID ${item.productId} no existe o no está activo`,
            );
          }

          const currentStockNum = Number(product.currentStock);
          if (currentStockNum < item.quantity) {
            throw new BadRequestException(
              `Stock insuficiente para "${product.name}". Solicitado: ${item.quantity}, Disponible en tienda: ${currentStockNum}`,
            );
          }

          const subtotalItem = Number((item.quantity * item.unitPrice).toFixed(2));
          totalCalculated += subtotalItem;

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

        const totalAmountDecimal = new Prisma.Decimal(Number(totalCalculated.toFixed(2)));

        // 2. Crear la Venta y sus Detalles de forma atómica
        const sale = await tx.sale.create({
          data: {
            cashShiftId: shift.id,
            userId,
            customerName: dto.customerName || 'Cliente Varios',
            customerDocument: dto.customerDocument || null,
            paymentMethod: dto.paymentMethod,
            cashPaid: new Prisma.Decimal(dto.cashPaid),
            digitalPaid: new Prisma.Decimal(dto.digitalPaid),
            totalAmount: totalAmountDecimal,
            changeAmount: new Prisma.Decimal(dto.changeAmount),
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

        // 3. Descontar stock atómicamente y asentar en Kardex con referencia exacta al ticket
        for (const item of validatedItems) {
          const currentStockNum = Number(item.product.currentStock);
          const newStock = Number((currentStockNum - item.quantity).toFixed(3));

          // Descontar existencias físicas
          await tx.product.update({
            where: { id: item.product.id },
            data: {
              currentStock: new Prisma.Decimal(newStock),
            },
          });

          // Registrar movimiento en Kardex de tipo SALIDA (SALE) con trazabilidad total
          await tx.kardexMovement.create({
            data: {
              productId: item.product.id,
              movementType: MovementType.SALE,
              quantity: new Prisma.Decimal(item.quantity),
              previousStock: item.product.currentStock,
              newStock: new Prisma.Decimal(newStock),
              unitCost: item.product.costPrice,
              referenceId: sale.id,
              reason: `Venta POS #${sale.saleNumber} - ${shift.cashRegister.name}`,
              userId,
            },
          });
        }

        return {
          message: 'Venta registrada exitosamente',
          sale: {
            ...sale,
            totalAmount: Number(sale.totalAmount),
            cashPaid: Number(sale.cashPaid),
            digitalPaid: Number(sale.digitalPaid),
            changeAmount: Number(sale.changeAmount),
            items: sale.items.map((i) => ({
              ...i,
              quantity: Number(i.quantity),
              unitPrice: Number(i.unitPrice),
              subtotal: Number(i.subtotal),
            })),
          },
        };
      },
      {
        timeout: 10000, // 10 segundos de timeout para operaciones concurrentes
      },
    );
  }

  /**
   * Anulación de venta protegida con PIN de Administrador
   */
  async voidSale(saleId: string, dto: VoidSaleDto) {
    // 1. Validar PIN del administrador
    const admin = await this.prisma.user.findFirst({
      where: {
        role: Role.ADMIN,
        isActive: true,
        pin: dto.adminPin,
      },
    });

    if (!admin) {
      throw new UnauthorizedException('PIN de administrador inválido para autorizar la anulación');
    }

    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        items: { include: { product: true } },
      },
    });

    if (!sale) {
      throw new NotFoundException('Venta no encontrada');
    }

    if (sale.isVoided) {
      throw new BadRequestException('Esta venta ya se encuentra anulada previamente');
    }

    // 2. Reingresar stock a Kardex y anular venta atómicamente
    return this.prisma.$transaction(async (tx) => {
      for (const item of sale.items) {
        const prod = await tx.product.findUnique({ where: { id: item.productId } });
        if (!prod) continue;

        const currentStockNum = Number(prod.currentStock);
        const qtyToReturn = Number(item.quantity);
        const newStock = currentStockNum + qtyToReturn;

        // Devolver stock
        await tx.product.update({
          where: { id: prod.id },
          data: {
            currentStock: new Prisma.Decimal(newStock),
          },
        });

        // Registrar devolución en Kardex
        await tx.kardexMovement.create({
          data: {
            productId: prod.id,
            movementType: MovementType.RETURN_SALE,
            quantity: new Prisma.Decimal(qtyToReturn),
            previousStock: prod.currentStock,
            newStock: new Prisma.Decimal(newStock),
            unitCost: prod.costPrice,
            referenceId: sale.id,
            reason: `Anulación de venta #${sale.saleNumber} - Motivo: ${dto.reason}`,
            userId: admin.id,
          },
        });
      }

      // Marcar venta como anulada
      const voided = await tx.sale.update({
        where: { id: sale.id },
        data: {
          isVoided: true,
          voidedAt: new Date(),
          voidedReason: dto.reason,
          voidedByAdminId: admin.id,
        },
      });

      return {
        message: 'Venta anulada correctamente. Stock devuelto a inventario.',
        saleId: voided.id,
        saleNumber: voided.saleNumber,
        authorizedBy: admin.name,
      };
    });
  }

  /**
   * Historial de ventas con control de visibilidad por rol
   */
  async getSales(userRole: Role, filter?: { shiftId?: string; isVoided?: boolean }) {
    const where: Prisma.SaleWhereInput = {};

    if (filter?.shiftId) where.cashShiftId = filter.shiftId;
    if (filter?.isVoided !== undefined) where.isVoided = filter.isVoided;

    const sales = await this.prisma.sale.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, barcode: true },
            },
          },
        },
        user: { select: { id: true, name: true, username: true } },
        cashShift: { include: { cashRegister: true } },
      },
    });

    return sales.map((s) => {
      const base = {
        id: s.id,
        saleNumber: s.saleNumber,
        createdAt: s.createdAt,
        customerName: s.customerName,
        customerDocument: s.customerDocument,
        paymentMethod: s.paymentMethod,
        cashPaid: Number(s.cashPaid),
        digitalPaid: Number(s.digitalPaid),
        totalAmount: Number(s.totalAmount),
        changeAmount: Number(s.changeAmount),
        isVoided: s.isVoided,
        voidedReason: s.voidedReason,
        user: s.user,
        cashRegister: s.cashShift.cashRegister.name,
        items: s.items.map((i) => ({
          id: i.id,
          productName: i.product.name,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
          subtotal: Number(i.subtotal),
        })),
      };

      if (userRole === Role.ADMIN) {
        // Calcular utilidad neta de la venta
        const totalCost = s.items.reduce(
          (acc, i) => acc + Number(i.quantity) * Number(i.costPriceSnapshot),
          0,
        );
        const profit = Number(s.totalAmount) - totalCost;

        return {
          ...base,
          totalCost: Number(totalCost.toFixed(2)),
          profit: Number(profit.toFixed(2)),
        };
      }

      return base;
    });
  }

  /**
   * Reporte detallado de ganancias y rentabilidad (Solo Administrador)
   */
  async getProfitReport(filter?: { startDate?: string; endDate?: string; shiftId?: string }) {
    const saleWhere: Prisma.SaleWhereInput = {
      isVoided: false,
    };

    const expenseWhere: Prisma.CashMovementWhereInput = {
      type: CashMovementType.EXPENSE,
    };

    if (filter?.shiftId) {
      saleWhere.cashShiftId = filter.shiftId;
      expenseWhere.cashShiftId = filter.shiftId;
    }

    if (filter?.startDate || filter?.endDate) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (filter.startDate) {
        const start = filter.startDate.includes('T')
          ? new Date(filter.startDate)
          : new Date(`${filter.startDate}T00:00:00.000`);
        if (!isNaN(start.getTime())) dateFilter.gte = start;
      }
      if (filter.endDate) {
        const end = filter.endDate.includes('T')
          ? new Date(filter.endDate)
          : new Date(`${filter.endDate}T23:59:59.999`);
        if (!isNaN(end.getTime())) dateFilter.lte = end;
      }
      if (dateFilter.gte || dateFilter.lte) {
        saleWhere.createdAt = dateFilter;
        expenseWhere.createdAt = dateFilter;
      }
    }

    const [sales, expenses] = await Promise.all([
      this.prisma.sale.findMany({
        where: saleWhere,
        orderBy: { createdAt: 'desc' },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  barcode: true,
                  unitType: true,
                  category: { select: { id: true, name: true } },
                },
              },
            },
          },
          user: { select: { id: true, name: true, username: true } },
          cashShift: { include: { cashRegister: true } },
        },
      }),
      this.prisma.cashMovement.findMany({
        where: expenseWhere,
        orderBy: { createdAt: 'desc' },
        include: {
          cashShift: {
            include: {
              cashRegister: true,
              user: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    // Resumen financiero
    let totalSales = 0;
    let totalCost = 0;
    let totalUnitsSold = 0;
    let cashPaidTotal = 0;
    let digitalPaidTotal = 0;

    const paymentMethods: Record<string, number> = {
      CASH: 0,
      CARD: 0,
      TRANSFER: 0,
      MIXED: 0,
    };

    // Agrupación de métricas por producto vendido
    const productStatsMap = new Map<
      string,
      {
        productId: string;
        productName: string;
        barcode: string | null;
        categoryName: string;
        unitType: string;
        quantitySold: number;
        totalRevenue: number;
        totalCost: number;
        profit: number;
        marginPct: number;
      }
    >();

    const salesDetail = sales.map((s) => {
      const saleAmount = Number(s.totalAmount);
      totalSales += saleAmount;
      cashPaidTotal += Number(s.cashPaid);
      digitalPaidTotal += Number(s.digitalPaid);

      if (paymentMethods[s.paymentMethod] !== undefined) {
        paymentMethods[s.paymentMethod] += saleAmount;
      }

      let saleCost = 0;
      let saleUnits = 0;

      const itemsDetail = s.items.map((i) => {
        const qty = Number(i.quantity);
        const unitP = Number(i.unitPrice);
        const sub = Number(i.subtotal);
        const unitCost = Number(i.costPriceSnapshot);
        const itemCost = Number((qty * unitCost).toFixed(2));
        const itemProfit = Number((sub - itemCost).toFixed(2));

        saleCost += itemCost;
        saleUnits += qty;
        totalUnitsSold += qty;

        const prodKey = i.productId;
        const existing = productStatsMap.get(prodKey);
        if (existing) {
          existing.quantitySold += qty;
          existing.totalRevenue += sub;
          existing.totalCost += itemCost;
          existing.profit += itemProfit;
        } else {
          productStatsMap.set(prodKey, {
            productId: i.productId,
            productName: i.product.name,
            barcode: i.product.barcode,
            categoryName: i.product.category?.name || 'General',
            unitType: i.product.unitType,
            quantitySold: qty,
            totalRevenue: sub,
            totalCost: itemCost,
            profit: itemProfit,
            marginPct: 0,
          });
        }

        return {
          id: i.id,
          productId: i.productId,
          productName: i.product.name,
          barcode: i.product.barcode,
          quantity: qty,
          unitPrice: unitP,
          costPrice: unitCost,
          subtotal: sub,
          itemCost,
          profit: itemProfit,
        };
      });

      totalCost += saleCost;
      const saleProfit = Number((saleAmount - saleCost).toFixed(2));
      const saleMarginPct =
        saleCost > 0 ? Number(((saleProfit / saleCost) * 100).toFixed(1)) : 0;

      return {
        id: s.id,
        saleNumber: s.saleNumber,
        createdAt: s.createdAt,
        customerName: s.customerName,
        paymentMethod: s.paymentMethod,
        cashPaid: Number(s.cashPaid),
        digitalPaid: Number(s.digitalPaid),
        totalAmount: saleAmount,
        totalCost: Number(saleCost.toFixed(2)),
        profit: saleProfit,
        marginPct: saleMarginPct,
        unitsCount: saleUnits,
        cashier: s.user.name,
        cashRegister: s.cashShift?.cashRegister?.name || 'Caja',
        items: itemsDetail,
      };
    });

    // Calcular márgenes individuales y ordenar por mayor utilidad
    const productStats = Array.from(productStatsMap.values()).map((p) => {
      const margin =
        p.totalCost > 0
          ? Number(((p.profit / p.totalCost) * 100).toFixed(1))
          : 0;
      return {
        ...p,
        totalRevenue: Number(p.totalRevenue.toFixed(2)),
        totalCost: Number(p.totalCost.toFixed(2)),
        profit: Number(p.profit.toFixed(2)),
        marginPct: margin,
      };
    });

    productStats.sort((a, b) => b.profit - a.profit);

    // Gastos de caja menor registrados en el período
    const totalExpenses = expenses.reduce((acc, exp) => acc + Number(exp.amount), 0);
    const grossProfit = Number((totalSales - totalCost).toFixed(2));
    const netProfit = Number((grossProfit - totalExpenses).toFixed(2));
    const grossMarginPct =
      totalCost > 0 ? Number(((grossProfit / totalCost) * 100).toFixed(1)) : 0;
    const netMarginPct =
      totalSales > 0 ? Number(((netProfit / totalSales) * 100).toFixed(1)) : 0;

    return {
      summary: {
        totalSales: Number(totalSales.toFixed(2)),
        totalCost: Number(totalCost.toFixed(2)),
        grossProfit,
        totalExpenses: Number(totalExpenses.toFixed(2)),
        netProfit,
        grossMarginPct,
        netMarginPct,
        salesCount: sales.length,
        totalUnitsSold: Number(totalUnitsSold.toFixed(2)),
        cashPaidTotal: Number(cashPaidTotal.toFixed(2)),
        digitalPaidTotal: Number(digitalPaidTotal.toFixed(2)),
        paymentMethods,
      },
      products: productStats,
      sales: salesDetail,
      expenses: expenses.map((e) => ({
        id: e.id,
        amount: Number(e.amount),
        reason: e.reason,
        createdAt: e.createdAt,
        cashRegister: e.cashShift?.cashRegister?.name || 'Caja',
        cashier: e.cashShift?.user?.name || '--',
      })),
    };
  }

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
        const saleResult = await this.prisma.$transaction(
          async (tx) => {
            let totalCalculated = 0;
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

            for (const item of offlineSale.items) {
              const product = await tx.product.findUnique({
                where: { id: item.productId },
              });

              if (!product) {
                throw new BadRequestException(`Producto ID ${item.productId} no encontrado`);
              }

              const subtotalItem = Number((item.quantity * item.unitPrice).toFixed(2));
              totalCalculated += subtotalItem;

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

            const totalAmountDecimal = new Prisma.Decimal(Number(totalCalculated.toFixed(2)));
            const saleDate = offlineSale.createdAt ? new Date(offlineSale.createdAt) : new Date();

            const sale = await tx.sale.create({
              data: {
                cashShiftId: targetShift.id,
                userId,
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

            // 4. Actualizar stock y registrar en Kardex con fecha original
            for (const item of validatedItems) {
              const currentStockNum = Number(item.product.currentStock);
              const newStock = Number((currentStockNum - item.quantity).toFixed(3));

              await tx.product.update({
                where: { id: item.product.id },
                data: {
                  currentStock: new Prisma.Decimal(newStock),
                },
              });

              await tx.kardexMovement.create({
                data: {
                  productId: item.product.id,
                  movementType: MovementType.SALE,
                  quantity: new Prisma.Decimal(item.quantity),
                  previousStock: item.product.currentStock,
                  newStock: new Prisma.Decimal(newStock),
                  unitCost: item.product.costPrice,
                  referenceId: sale.id,
                  reason: `Venta POS Offline #${sale.saleNumber} [OFFLINE:${offlineSale.offlineId}] - ${targetShift.cashRegister.name}`,
                  userId,
                  createdAt: saleDate,
                },
              });
            }

            return sale;
          },
          { timeout: 15000 },
        );

        results.push({
          offlineId: offlineSale.offlineId,
          success: true,
          sale: {
            ...saleResult,
            totalAmount: Number(saleResult.totalAmount),
            cashPaid: Number(saleResult.cashPaid),
            digitalPaid: Number(saleResult.digitalPaid),
            changeAmount: Number(saleResult.changeAmount),
            items: saleResult.items.map((i) => ({
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
}

