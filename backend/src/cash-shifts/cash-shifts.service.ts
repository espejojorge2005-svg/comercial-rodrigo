import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ShiftStatus, CashMovementType, Role, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { OpenShiftDto } from './dto/open-shift.dto.js';
import { CloseShiftDto } from './dto/close-shift.dto.js';
import { CashMovementDto } from './dto/cash-movement.dto.js';

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
        paymentMethod: true,
      },
    });

    const totalSales = sales.reduce((acc, s) => acc + Number(s.totalAmount), 0);
    const cashSales = sales.reduce((acc, s) => acc + Number(s.cashPaid), 0);
    const digitalSales = sales.reduce((acc, s) => acc + Number(s.digitalPaid), 0);

    const totalIncomeMovements = shift.cashMovements
      .filter((m) => m.type === CashMovementType.INCOME)
      .reduce((acc, m) => acc + Number(m.amount), 0);

    const totalExpenseMovements = shift.cashMovements
      .filter((m) => m.type === CashMovementType.EXPENSE)
      .reduce((acc, m) => acc + Number(m.amount), 0);

    return {
      ...shift,
      initialBalance: Number(shift.initialBalance),
      metrics: {
        totalSales,
        cashSales,
        digitalSales,
        salesCount: sales.length,
        totalIncomeMovements,
        totalExpenseMovements,
      },
    };
  }

  /**
   * Apertura de turno en una caja física
   */
  async openShift(userId: string, dto: OpenShiftDto) {
    // 1. Verificar si el usuario ya tiene un turno abierto
    const existingUserShift = await this.prisma.cashShift.findFirst({
      where: {
        userId,
        status: ShiftStatus.OPEN,
      },
    });

    if (existingUserShift) {
      throw new BadRequestException('Ya tienes un turno activo abierto en el sistema.');
    }

    // 2. Verificar si la caja física seleccionada ya está ocupada por otro usuario
    const existingRegisterShift = await this.prisma.cashShift.findFirst({
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
    const newShift = await this.prisma.cashShift.create({
      data: {
        userId,
        cashRegisterId: dto.cashRegisterId,
        initialBalance: new Prisma.Decimal(dto.initialBalance),
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
  }

  /**
   * Cierre de turno con ARQUEO CIEGO para el cajero
   */
  async closeShift(userId: string, userRole: Role, dto: CloseShiftDto) {
    const shift = await this.prisma.cashShift.findUnique({
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

    // Calcular ventas no anuladas del turno
    const sales = await this.prisma.sale.findMany({
      where: {
        cashShiftId: shift.id,
        isVoided: false,
      },
      select: {
        cashPaid: true,
        digitalPaid: true,
        totalAmount: true,
      },
    });

    const cashFromSales = sales.reduce((acc, s) => acc + Number(s.cashPaid), 0);
    const digitalFromSales = sales.reduce((acc, s) => acc + Number(s.digitalPaid), 0);

    // Calcular movimientos de caja chica
    const incomeMovements = shift.cashMovements
      .filter((m) => m.type === CashMovementType.INCOME)
      .reduce((acc, m) => acc + Number(m.amount), 0);

    const expenseMovements = shift.cashMovements
      .filter((m) => m.type === CashMovementType.EXPENSE)
      .reduce((acc, m) => acc + Number(m.amount), 0);

    // Saldo esperado en efectivo en gaveta:
    // Saldo Inicial + Ventas en Efectivo + Ingresos manuales - Egresos manuales
    const expectedCashInDrawer =
      Number(shift.initialBalance) + cashFromSales + incomeMovements - expenseMovements;

    // Diferencia = Lo que el cajero contó - Lo que el sistema calcula
    const difference = dto.actualBalance - expectedCashInDrawer;

    // Actualizar registro en base de datos
    const updatedShift = await this.prisma.cashShift.update({
      where: { id: shift.id },
      data: {
        status: ShiftStatus.CLOSED,
        closedAt: new Date(),
        actualBalance: new Prisma.Decimal(dto.actualBalance),
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
        message: 'Turno cerrado exitosamente. Su arqueo ha sido registrado para revisión de administración.',
        shiftId: updatedShift.id,
        caja: updatedShift.cashRegister.name,
        closedAt: updatedShift.closedAt,
        reportedAmount: dto.actualBalance,
      };
    }

    // Si es ADMIN, mostramos la auditoría completa
    return {
      message: 'Turno cerrado y auditado exitosamente por administración',
      shiftId: updatedShift.id,
      caja: updatedShift.cashRegister.name,
      closedAt: updatedShift.closedAt,
      initialBalance: Number(shift.initialBalance),
      cashFromSales,
      digitalFromSales,
      incomeMovements,
      expenseMovements,
      expectedBalance: expectedCashInDrawer,
      actualBalance: dto.actualBalance,
      difference,
      hasDiscrepancy: difference !== 0,
      discrepancyType: difference > 0 ? 'SOBRANTE' : difference < 0 ? 'FALTANTE' : 'EXACTO',
    };
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
   */
  async getShiftHistory() {
    const shifts = await this.prisma.cashShift.findMany({
      orderBy: { openedAt: 'desc' },
      take: 50,
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
            paymentMethod: true,
            createdAt: true,
          },
        },
      },
    });

    return shifts.map((s) => {
      const sales = s.sales || [];
      const totalSales = sales.reduce((acc, sale) => acc + Number(sale.totalAmount), 0);
      const cashFromSales = sales.reduce((acc, sale) => acc + Number(sale.cashPaid), 0);
      const digitalFromSales = sales.reduce((acc, sale) => acc + Number(sale.digitalPaid), 0);

      const yapePlinSales = sales
        .filter((sale) => sale.paymentMethod === 'TRANSFER')
        .reduce((acc, sale) => acc + Number(sale.totalAmount), 0);
      const cardSales = sales
        .filter((sale) => sale.paymentMethod === 'CARD')
        .reduce((acc, sale) => acc + Number(sale.totalAmount), 0);
      const pureCashSales = sales
        .filter((sale) => sale.paymentMethod === 'CASH')
        .reduce((acc, sale) => acc + Number(sale.totalAmount), 0);
      const mixedSales = sales
        .filter((sale) => sale.paymentMethod === 'MIXED')
        .reduce((acc, sale) => acc + Number(sale.totalAmount), 0);

      const incomeMovements = s.cashMovements
        .filter((m) => m.type === CashMovementType.INCOME)
        .reduce((acc, m) => acc + Number(m.amount), 0);
      const expenseMovements = s.cashMovements
        .filter((m) => m.type === CashMovementType.EXPENSE)
        .reduce((acc, m) => acc + Number(m.amount), 0);

      return {
        ...s,
        initialBalance: Number(s.initialBalance),
        expectedBalance: s.expectedBalance ? Number(s.expectedBalance) : null,
        actualBalance: s.actualBalance ? Number(s.actualBalance) : null,
        difference: s.difference ? Number(s.difference) : null,
        metrics: {
          totalSales,
          cashFromSales,
          digitalFromSales,
          yapePlinSales,
          cardSales,
          pureCashSales,
          mixedSales,
          salesCount: sales.length,
          incomeMovements,
          expenseMovements,
        },
      };
    });
  }
}
