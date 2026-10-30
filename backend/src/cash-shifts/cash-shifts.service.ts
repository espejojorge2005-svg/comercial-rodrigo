import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ShiftStatus, CashMovementType, Role, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { OpenShiftDto } from './dto/open-shift.dto.js';
import { CloseShiftDto } from './dto/close-shift.dto.js';
import { CashMovementDto } from './dto/cash-movement.dto.js';
import { buildPeruDateTimeFilter } from '../reports/reports.service.js';

/**
 * Calcula el efectivo neto real que queda en la gaveta física por una venta:
 * - TRANSFER / CARD: S/ 0.00 (el dinero ingresó a cuenta bancaria o POS digital)
 * - CASH: cashPaid - changeAmount (igual al total de la venta)
 * - MIXED: cruza cashPaid - changeAmount con totalAmount - digitalPaid para garantizar
 *   que si hubo un excedente en el pago digital o se entregó vuelto, solo se considere
 *   el efectivo neto real que efectivamente queda en caja sin distorsionar el arqueo.
 */
export function calculateNetCashFromSale(s: {
  paymentMethod: string;
  cashPaid: any;
  changeAmount: any;
  digitalPaid?: any;
  totalAmount: any;
}): number {
  if (s.paymentMethod === 'TRANSFER' || s.paymentMethod === 'CARD') {
    return 0;
  }
  if (s.paymentMethod === 'MIXED') {
    const netCashByPaid = Number(s.cashPaid) - Number(s.changeAmount || 0);
    const netCashByTotal = Number(s.totalAmount) - Number(s.digitalPaid || 0);
    return Math.max(0, Number(Math.min(netCashByPaid, netCashByTotal).toFixed(2)));
  }
  return Math.max(0, Number((Number(s.cashPaid) - Number(s.changeAmount || 0)).toFixed(2)));
}

@Injectable()
export class CashShiftsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Obtiene las cajas físicas y su estado de disponibilidad en tiempo real
   */
  async getCashRegisters() {
    const registers = await this.prisma.cashRegister.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    const results = await Promise.all(
      registers.map(async (reg) => {
        const activeShift = await this.prisma.cashShift.findFirst({
          where: {
            cashRegisterId: reg.id,
            status: ShiftStatus.OPEN,
          },
          include: {
            user: {
              select: { id: true, name: true, username: true, role: true },
            },
          },
        });

        return {
          id: reg.id,
          name: reg.name,
          identifier: reg.identifier,
          isActive: reg.isActive,
          isAvailable: !activeShift,
          activeShift: activeShift
            ? {
                id: activeShift.id,
                openedAt: activeShift.openedAt,
                initialBalance: Number(activeShift.initialBalance),
                user: activeShift.user,
              }
            : null,
        };
      }),
    );

    return results;
  }

  /**
   * Obtiene el turno activo del usuario autenticado
   */
  async getActiveShiftForUser(userId: string) {
    const shift = await this.prisma.cashShift.findFirst({
      where: {
        userId,
        status: ShiftStatus.OPEN,
      },
      include: {
        cashRegister: true,
        cashMovements: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!shift) {
      return null;
    }

    // Calcular ventas acumuladas en este turno
    const sales = await this.prisma.sale.findMany({
      where: {
        cashShiftId: shift.id,
        isVoided: false,
      },
      select: {
        totalAmount: true,
        cashPaid: true,
        digitalPaid: true,
        changeAmount: true,
        paymentMethod: true,
      },
    });

    const totalSales = sales.reduce((acc, s) => acc + Number(s.totalAmount), 0);
    const cashSales = sales.reduce((acc, s) => acc + calculateNetCashFromSale(s), 0);
    const digitalSales = sales.reduce((acc, s) => acc + Number(s.digitalPaid), 0);

    const totalIncomeMovements = shift.cashMovements
      .filter((m) => m.type === CashMovementType.INCOME)
      .reduce((acc, m) => acc + Number(m.amount), 0);

    const totalExpenseMovements = shift.cashMovements
      .filter((m) => m.type === CashMovementType.EXPENSE)
      .reduce((acc, m) => acc + Number(m.amount), 0);

    const roundedIncomeMovements = Number(totalIncomeMovements.toFixed(2));
    const roundedExpenseMovements = Number(totalExpenseMovements.toFixed(2));

    return {
      ...shift,
      initialBalance: Number(shift.initialBalance),
      metrics: {
        totalSales: Number(totalSales.toFixed(2)),
        cashSales: Number(cashSales.toFixed(2)),
        cashFromSales: Number(cashSales.toFixed(2)),
        cashPaidTotal: Number(cashSales.toFixed(2)),
        digitalSales: Number(digitalSales.toFixed(2)),
        salesCount: sales.length,
        incomeMovements: roundedIncomeMovements,
        expenseMovements: roundedExpenseMovements,
        totalIncomeMovements: roundedIncomeMovements,
        totalExpenseMovements: roundedExpenseMovements,
      },
    };
  }

  /**
   * Apertura de turno en una caja física (atómica y protegida contra doble apertura concurrente)
   */
  async openShift(userId: string, dto: OpenShiftDto) {
    if (!Number.isFinite(dto.initialBalance) || dto.initialBalance < 0) {
      throw new BadRequestException('El saldo inicial de apertura no puede ser negativo.');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Verificar si el usuario ya tiene un turno abierto
        const existingUserShift = await tx.cashShift.findFirst({
          where: {
            userId,
            status: ShiftStatus.OPEN,
          },
        });

        if (existingUserShift) {
          throw new BadRequestException('Ya tienes un turno activo abierto en el sistema.');
        }

        // 2. Verificar si la caja física seleccionada ya está ocupada por otro usuario
        const existingRegisterShift = await tx.cashShift.findFirst({
          where: {
            cashRegisterId: dto.cashRegisterId,
            status: ShiftStatus.OPEN,
          },
          include: { user: true },
        });

        if (existingRegisterShift) {
          throw new BadRequestException(
            `Esta caja física ya se encuentra en uso por el usuario ${existingRegisterShift.user.name}.`,
          );
        }

        // 3. Crear el turno
        const newShift = await tx.cashShift.create({
          data: {
            userId,
            cashRegisterId: dto.cashRegisterId,
            initialBalance: new Prisma.Decimal(Number(dto.initialBalance.toFixed(2))),
            status: ShiftStatus.OPEN,
            notes: dto.notes,
          },
          include: {
            cashRegister: true,
            user: { select: { id: true, name: true, username: true } },
          },
        });

        return {
          message: 'Turno de caja aperturado exitosamente',
          shift: {
            ...newShift,
            initialBalance: Number(newShift.initialBalance),
          },
        };
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new BadRequestException(
          'La caja seleccionada o tu usuario ya cuenta con un turno abierto en curso.',
        );
      }
      throw error;
    }
  }

  /**
   * Cierre de turno con ARQUEO CIEGO para el cajero (transaccional e idempotente ante doble clic)
   */
  async closeShift(userId: string, userRole: Role, dto: CloseShiftDto) {
    if (!Number.isFinite(dto.actualBalance) || dto.actualBalance < 0) {
      throw new BadRequestException('El monto físico declarado no puede ser negativo.');
    }

    return this.prisma.$transaction(async (tx) => {
      const shift = await tx.cashShift.findUnique({
        where: { id: dto.shiftId },
        include: {
          cashMovements: true,
          cashRegister: true,
        },
      });

      if (!shift) {
        throw new NotFoundException('Turno de caja no encontrado');
      }

      if (shift.status === ShiftStatus.CLOSED) {
        throw new BadRequestException('Este turno ya ha sido cerrado previamente.');
      }

      // Si es cajero, solo puede cerrar su propio turno
      if (userRole === Role.CAJERO && shift.userId !== userId) {
        throw new ForbiddenException('No tienes permiso para cerrar el turno de otro usuario.');
      }

      // Bloqueo atómico para evitar condiciones de carrera por doble clic al cerrar caja
      if (typeof (tx.cashShift as any).updateMany === 'function') {
        const lockResult = await tx.cashShift.updateMany({
          where: { id: shift.id, status: ShiftStatus.OPEN },
          data: { status: ShiftStatus.CLOSED },
        });
        if (lockResult.count === 0) {
          throw new BadRequestException('Este turno ya ha sido cerrado previamente.');
        }
      }

      // Calcular ventas no anuladas del turno con sus productos
      const sales = await tx.sale.findMany({
        where: {
          cashShiftId: shift.id,
          isVoided: false,
        },
        select: {
          id: true,
          saleNumber: true,
          cashPaid: true,
          digitalPaid: true,
          changeAmount: true,
          totalAmount: true,
          paymentMethod: true,
          createdAt: true,
          items: {
            select: {
              quantity: true,
              unitPrice: true,
              subtotal: true,
              product: {
                select: {
                  id: true,
                  name: true,
                  barcode: true,
                  unitType: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      const cashFromSales = Number(
        sales.reduce((acc, s) => acc + calculateNetCashFromSale(s), 0).toFixed(2),
      );
      const digitalFromSales = Number(
        sales.reduce((acc, s) => acc + Number(s.digitalPaid), 0).toFixed(2),
      );
      const totalSales = Number(
        sales.reduce((acc, s) => acc + Number(s.totalAmount), 0).toFixed(2),
      );

      // Agrupar resumen de productos vendidos en el turno
      const productsMap = new Map<
        string,
        {
          productId: string;
          productName: string;
          barcode?: string | null;
          unitType: string;
          quantity: number;
          totalRevenue: number;
        }
      >();

      for (const s of sales) {
        for (const it of s.items) {
          const pId = it.product.id;
          const qty = Number(it.quantity);
          const subtotal = Number(it.subtotal);
          const existing = productsMap.get(pId);
          if (existing) {
            existing.quantity = Number((existing.quantity + qty).toFixed(3));
            existing.totalRevenue = Number((existing.totalRevenue + subtotal).toFixed(2));
          } else {
            productsMap.set(pId, {
              productId: pId,
              productName: it.product.name,
              barcode: it.product.barcode,
              unitType: it.product.unitType,
              quantity: Number(qty.toFixed(3)),
              totalRevenue: Number(subtotal.toFixed(2)),
            });
          }
        }
      }

      const soldProducts = Array.from(productsMap.values()).sort(
        (a, b) => b.totalRevenue - a.totalRevenue,
      );

      const salesList = sales.map((s) => ({
        id: s.id,
        saleNumber: s.saleNumber,
        totalAmount: Number(s.totalAmount),
        paymentMethod: s.paymentMethod,
        createdAt: s.createdAt,
      }));

      // Calcular movimientos de caja chica
      const incomeMovements = Number(
        shift.cashMovements
          .filter((m) => m.type === CashMovementType.INCOME)
          .reduce((acc, m) => acc + Number(m.amount), 0)
          .toFixed(2),
      );

      const expenseMovements = Number(
        shift.cashMovements
          .filter((m) => m.type === CashMovementType.EXPENSE)
          .reduce((acc, m) => acc + Number(m.amount), 0)
          .toFixed(2),
      );

      // Saldo esperado en efectivo en gaveta:
      // Saldo Inicial + Ventas en Efectivo + Ingresos manuales - Egresos manuales
      const expectedCashInDrawer = Number(
        (Number(shift.initialBalance) + cashFromSales + incomeMovements - expenseMovements).toFixed(
          2,
        ),
      );

      const actualBalanceRounded = Number(dto.actualBalance.toFixed(2));
      // Diferencia = Lo que el cajero contó - Lo que el sistema calcula
      const difference = Number((actualBalanceRounded - expectedCashInDrawer).toFixed(2));

      // Actualizar registro en base de datos
      const updatedShift = await tx.cashShift.update({
        where: { id: shift.id },
        data: {
          status: ShiftStatus.CLOSED,
          closedAt: new Date(),
          actualBalance: new Prisma.Decimal(actualBalanceRounded),
          expectedBalance: new Prisma.Decimal(expectedCashInDrawer),
          difference: new Prisma.Decimal(difference),
          notes: dto.notes ? `${shift.notes ? shift.notes + ' | ' : ''}${dto.notes}` : shift.notes,
        },
        include: {
          user: { select: { id: true, name: true, username: true } },
          cashRegister: true,
        },
      });

      // 🛡️ REGLA ANTIFRAUDE (Arqueo Ciego):
      // Si el usuario es CAJERO, no le mostramos si sobró o faltó dinero para evitar manipulaciones.
      if (userRole === Role.CAJERO) {
        return {
          message:
            'Turno cerrado exitosamente. Su arqueo ha sido registrado para revisión de administración.',
          shiftId: updatedShift.id,
          caja: updatedShift.cashRegister.name,
          cajaIdentifier: updatedShift.cashRegister.identifier,
          cashierName: updatedShift.user?.name,
          openedAt: shift.openedAt,
          closedAt: updatedShift.closedAt,
          initialBalance: Number(shift.initialBalance),
          actualBalance: actualBalanceRounded,
          reportedAmount: actualBalanceRounded,
          salesCount: sales.length,
          totalSales,
          soldProducts,
          salesList,
          notes: dto.notes || shift.notes || '',
          isBlindAudit: true,
        };
      }

      // Si es ADMIN, mostramos la auditoría completa
      return {
        message: 'Turno cerrado y auditado exitosamente por administración',
        shiftId: updatedShift.id,
        caja: updatedShift.cashRegister.name,
        cajaIdentifier: updatedShift.cashRegister.identifier,
        cashierName: updatedShift.user?.name,
        openedAt: shift.openedAt,
        closedAt: updatedShift.closedAt,
        initialBalance: Number(shift.initialBalance),
        totalSales,
        cashFromSales,
        cashPaidTotal: cashFromSales,
        digitalFromSales,
        incomeMovements,
        expenseMovements,
        totalIncomeMovements: incomeMovements,
        totalExpenseMovements: expenseMovements,
        expectedBalance: expectedCashInDrawer,
        actualBalance: actualBalanceRounded,
        reportedAmount: actualBalanceRounded,
        difference,
        hasDiscrepancy: difference !== 0,
        discrepancyType: difference > 0 ? 'SOBRANTE' : difference < 0 ? 'FALTANTE' : 'EXACTO',
        salesCount: sales.length,
        soldProducts,
        salesList,
        notes: dto.notes || shift.notes || '',
        isBlindAudit: false,
      };
    });
  }

  /**
   * Registro de movimiento de efectivo en caja chica (Ingreso / Egreso)
   */
  async registerCashMovement(userId: string, userRole: Role, dto: CashMovementDto) {
    const shift = await this.prisma.cashShift.findUnique({
      where: { id: dto.shiftId },
    });

    if (!shift) {
      throw new NotFoundException('Turno no encontrado');
    }

    if (shift.status !== ShiftStatus.OPEN) {
      throw new BadRequestException('No se pueden registrar movimientos en un turno cerrado.');
    }

    if (userRole === Role.CAJERO && shift.userId !== userId) {
      throw new ForbiddenException('No puedes registrar movimientos en el turno de otro usuario.');
    }

    const movement = await this.prisma.cashMovement.create({
      data: {
        cashShiftId: dto.shiftId,
        type: dto.type,
        amount: new Prisma.Decimal(dto.amount),
        reason: dto.reason,
      },
    });

    return {
      message: `${dto.type === CashMovementType.INCOME ? 'Ingreso' : 'Egreso'} registrado correctamente`,
      movement: {
        ...movement,
        amount: Number(movement.amount),
      },
    };
  }

  /**
   * Historial de turnos y arqueos (Solo Administrador)
   * Permite filtrar por rango de fechas (mes completo) sin limitación arbitraria de take: 50
   */
  async getShiftHistory(filter?: { startDate?: string; endDate?: string; limit?: number; minimal?: boolean }) {
    const where: Prisma.CashShiftWhereInput = {};

    const dateFilter = buildPeruDateTimeFilter(filter?.startDate, filter?.endDate);
    if (dateFilter) {
      where.openedAt = dateFilter;
    }

    const take = filter?.limit
      ? filter.limit
      : !filter?.startDate && !filter?.endDate
        ? 50
        : undefined;

    if (filter?.minimal) {
      return this.prisma.cashShift.findMany({
        where,
        orderBy: { openedAt: 'desc' },
        ...(take !== undefined ? { take } : {}),
        select: {
          id: true,
          openedAt: true,
          closedAt: true,
          status: true,
          cashRegister: { select: { id: true, name: true, identifier: true } },
          user: { select: { id: true, name: true, username: true } },
        },
      });
    }

    const shifts = await this.prisma.cashShift.findMany({
      where,
      orderBy: { openedAt: 'desc' },
      ...(take !== undefined ? { take } : {}),
      include: {
        cashRegister: true,
        user: { select: { id: true, name: true, username: true } },
        cashMovements: {
          orderBy: { createdAt: 'desc' },
        },
        sales: {
          where: { isVoided: false },
          select: {
            id: true,
            saleNumber: true,
            totalAmount: true,
            cashPaid: true,
            digitalPaid: true,
            changeAmount: true,
            paymentMethod: true,
            createdAt: true,
            items: {
              select: {
                quantity: true,
                unitPrice: true,
                subtotal: true,
                product: {
                  select: {
                    id: true,
                    name: true,
                    barcode: true,
                    unitType: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return shifts.map((s) => {
      const sales = s.sales || [];
      const totalSales = Number(
        sales.reduce((acc, sale) => acc + Number(sale.totalAmount), 0).toFixed(2),
      );
      const cashFromSales = Number(
        sales.reduce((acc, sale) => acc + calculateNetCashFromSale(sale), 0).toFixed(2),
      );
      const digitalFromSales = Number(
        sales.reduce((acc, sale) => acc + Number(sale.digitalPaid), 0).toFixed(2),
      );

      const yapePlinSales = Number(
        sales
          .filter((sale) => sale.paymentMethod === 'TRANSFER')
          .reduce((acc, sale) => acc + Number(sale.totalAmount), 0)
          .toFixed(2),
      );
      const cardSales = Number(
        sales
          .filter((sale) => sale.paymentMethod === 'CARD')
          .reduce((acc, sale) => acc + Number(sale.totalAmount), 0)
          .toFixed(2),
      );
      const pureCashSales = Number(
        sales
          .filter((sale) => sale.paymentMethod === 'CASH')
          .reduce((acc, sale) => acc + Number(sale.totalAmount), 0)
          .toFixed(2),
      );
      const mixedSales = Number(
        sales
          .filter((sale) => sale.paymentMethod === 'MIXED')
          .reduce((acc, sale) => acc + Number(sale.totalAmount), 0)
          .toFixed(2),
      );

      const incomeMovements = Number(
        s.cashMovements
          .filter((m) => m.type === CashMovementType.INCOME)
          .reduce((acc, m) => acc + Number(m.amount), 0)
          .toFixed(2),
      );
      const expenseMovements = Number(
        s.cashMovements
          .filter((m) => m.type === CashMovementType.EXPENSE)
          .reduce((acc, m) => acc + Number(m.amount), 0)
          .toFixed(2),
      );

      // Resumen de artículos vendidos en el turno
      const productsMap = new Map<
        string,
        {
          productId: string;
          productName: string;
          barcode?: string | null;
          unitType: string;
          quantity: number;
          totalRevenue: number;
        }
      >();

      for (const sale of sales) {
        for (const it of sale.items || []) {
          const pId = it.product.id;
          const qty = Number(it.quantity);
          const subtotal = Number(it.subtotal);
          const existing = productsMap.get(pId);
          if (existing) {
            existing.quantity = Number((existing.quantity + qty).toFixed(3));
            existing.totalRevenue = Number((existing.totalRevenue + subtotal).toFixed(2));
          } else {
            productsMap.set(pId, {
              productId: pId,
              productName: it.product.name,
              barcode: it.product.barcode,
              unitType: it.product.unitType,
              quantity: Number(qty.toFixed(3)),
              totalRevenue: Number(subtotal.toFixed(2)),
            });
          }
        }
      }

      const soldProducts = Array.from(productsMap.values()).sort(
        (a, b) => b.totalRevenue - a.totalRevenue,
      );
      const salesList = sales.map((sale) => ({
        id: sale.id,
        saleNumber: sale.saleNumber,
        totalAmount: Number(sale.totalAmount),
        paymentMethod: sale.paymentMethod,
        createdAt: sale.createdAt,
      }));

      return {
        ...s,
        initialBalance: Number(s.initialBalance),
        expectedBalance:
          s.expectedBalance !== null && s.expectedBalance !== undefined
            ? Number(s.expectedBalance)
            : null,
        actualBalance:
          s.actualBalance !== null && s.actualBalance !== undefined
            ? Number(s.actualBalance)
            : null,
        difference:
          s.difference !== null && s.difference !== undefined ? Number(s.difference) : null,
        soldProducts,
        salesList,
        metrics: {
          totalSales,
          cashSales: cashFromSales,
          cashFromSales,
          cashPaidTotal: cashFromSales,
          digitalSales: digitalFromSales,
          digitalFromSales,
          yapePlinSales,
          cardSales,
          pureCashSales,
          mixedSales,
          salesCount: sales.length,
          soldProducts,
          salesList,
          incomeMovements,
          expenseMovements,
          totalIncomeMovements: incomeMovements,
          totalExpenseMovements: expenseMovements,
        },
      };
    });
  }
}
