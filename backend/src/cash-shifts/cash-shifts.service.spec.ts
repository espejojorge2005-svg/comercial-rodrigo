import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CashShiftsService, calculateNetCashFromSale } from './cash-shifts.service.js';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ShiftStatus, CashMovementType, Role } from '@prisma/client';

describe('CashShiftsService', () => {
  let service: CashShiftsService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      cashRegister: {
        findMany: vi.fn(),
      },
      cashShift: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      cashMovement: {
        create: vi.fn(),
      },
      sale: {
        findMany: vi.fn(),
      },
      $transaction: vi.fn(async (cb) => cb(mockPrisma)),
    };

    service = new CashShiftsService(mockPrisma);
  });

  describe('calculateNetCashFromSale (Regla de Arqueo Físico)', () => {
    it('debe retornar 0 para pagos íntegros con TRANSFER o CARD', () => {
      expect(
        calculateNetCashFromSale({
          paymentMethod: 'TRANSFER',
          cashPaid: 0,
          changeAmount: 0,
          totalAmount: 100,
        }),
      ).toBe(0);

      expect(
        calculateNetCashFromSale({
          paymentMethod: 'CARD',
          cashPaid: 0,
          changeAmount: 0,
          totalAmount: 50,
        }),
      ).toBe(0);
    });

    it('debe calcular correctamente el efectivo neto en pagos CASH con vuelto', () => {
      // Venta de S/ 60 pagada con billete de S/ 100 y vuelto de S/ 40
      expect(
        calculateNetCashFromSale({
          paymentMethod: 'CASH',
          cashPaid: 100,
          changeAmount: 40,
          totalAmount: 60,
        }),
      ).toBe(60);
    });

    it('debe cruzar y calcular con precisión el efectivo en pagos mixtos (MIXED)', () => {
      // Venta total S/ 100: S/ 60 por Yape/Transferencia + S/ 40 en efectivo (pagó S/ 50 y se dio vuelto S/ 10)
      expect(
        calculateNetCashFromSale({
          paymentMethod: 'MIXED',
          cashPaid: 50,
          changeAmount: 10,
          digitalPaid: 60,
          totalAmount: 100,
        }),
      ).toBe(40);
    });
  });

  describe('openShift (Apertura de Turno & Concurrencia)', () => {
    it('debe abrir turno exitosamente si el cajero y la caja están libres', async () => {
      mockPrisma.cashShift.findFirst.mockResolvedValue(null);
      mockPrisma.cashShift.create.mockResolvedValue({
        id: 'shift-1',
        userId: 'user-1',
        cashRegisterId: 'reg-1',
        initialBalance: 100,
        status: ShiftStatus.OPEN,
        cashRegister: { name: 'Caja 1', identifier: 'POS-01' },
        user: { id: 'user-1', name: 'Carlos', username: 'carlos' },
      });

      const result = await service.openShift('user-1', {
        cashRegisterId: 'reg-1',
        initialBalance: 100,
      });

      expect(result.shift.id).toBe('shift-1');
      expect(result.shift.initialBalance).toBe(100);
      expect(mockPrisma.cashShift.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            cashRegisterId: 'reg-1',
            status: ShiftStatus.OPEN,
          }),
        }),
      );
    });

    it('debe rechazar la apertura si el usuario ya tiene un turno abierto', async () => {
      mockPrisma.cashShift.findFirst.mockResolvedValueOnce({
        id: 'existing-shift',
        status: ShiftStatus.OPEN,
      });

      await expect(
        service.openShift('user-1', {
          cashRegisterId: 'reg-1',
          initialBalance: 50,
        }),
      ).rejects.toThrow('Ya tienes un turno activo abierto en el sistema.');
    });

    it('debe rechazar la apertura si la caja física ya está ocupada por otro cajero', async () => {
      mockPrisma.cashShift.findFirst
        .mockResolvedValueOnce(null) // Usuario libre
        .mockResolvedValueOnce({
          id: 'shift-caja-ocupada',
          user: { name: 'Carlos Cajero' },
        }); // Caja ocupada

      await expect(
        service.openShift('user-1', {
          cashRegisterId: 'reg-1',
          initialBalance: 50,
        }),
      ).rejects.toThrow('Esta caja física ya se encuentra en uso por el usuario Carlos Cajero.');
    });
  });

  describe('registerCashMovement (Movimientos de Caja)', () => {
    it('debe registrar un ingreso o retiro de efectivo en el turno activo', async () => {
      mockPrisma.cashShift.findUnique.mockResolvedValue({
        id: 'shift-active-1',
        userId: 'user-1',
        status: ShiftStatus.OPEN,
      });
      mockPrisma.cashMovement.create.mockResolvedValue({
        id: 'mov-1',
        cashShiftId: 'shift-active-1',
        type: CashMovementType.EXPENSE,
        amount: 25,
        reason: 'Pago de flete local',
      });

      const result = await service.registerCashMovement('user-1', Role.CAJERO, {
        shiftId: 'shift-active-1',
        type: CashMovementType.EXPENSE,
        amount: 25,
        reason: 'Pago de flete local',
      });

      expect(result.movement.id).toBe('mov-1');
      expect(result.movement.amount).toBe(25);
      expect(mockPrisma.cashMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          cashShiftId: 'shift-active-1',
          type: CashMovementType.EXPENSE,
          reason: 'Pago de flete local',
        }),
      });
    });

    it('debe fallar si el turno está cerrado', async () => {
      mockPrisma.cashShift.findUnique.mockResolvedValue({
        id: 'shift-closed-1',
        userId: 'user-1',
        status: ShiftStatus.CLOSED,
      });

      await expect(
        service.registerCashMovement('user-1', Role.CAJERO, {
          shiftId: 'shift-closed-1',
          type: CashMovementType.INCOME,
          amount: 10,
          reason: 'Aporte de sencillo',
        }),
      ).rejects.toThrow('No se pueden registrar movimientos en un turno cerrado.');
    });
  });

  describe('closeShift (Cierre de Turno & Arqueo Ciego)', () => {
    it('debe lanzar NotFoundException si el turno no existe', async () => {
      mockPrisma.cashShift.findUnique.mockResolvedValue(null);

      await expect(
        service.closeShift('user-1', Role.CAJERO, {
          shiftId: 'nonexistent',
          actualBalance: 200,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe lanzar BadRequestException si el turno ya fue cerrado', async () => {
      mockPrisma.cashShift.findUnique.mockResolvedValue({
        id: 'shift-1',
        status: ShiftStatus.CLOSED,
      });

      await expect(
        service.closeShift('user-1', Role.CAJERO, {
          shiftId: 'shift-1',
          actualBalance: 200,
        }),
      ).rejects.toThrow('Este turno ya ha sido cerrado previamente.');
    });

    it('debe lanzar ForbiddenException si un CAJERO intenta cerrar el turno de otro usuario', async () => {
      mockPrisma.cashShift.findUnique.mockResolvedValue({
        id: 'shift-1',
        userId: 'other-user',
        status: ShiftStatus.OPEN,
      });

      await expect(
        service.closeShift('user-1', Role.CAJERO, {
          shiftId: 'shift-1',
          actualBalance: 200,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('para un CAJERO debe aplicar la regla antifraude de Arqueo Ciego (isBlindAudit: true)', async () => {
      const shiftData = {
        id: 'shift-1',
        userId: 'user-1',
        initialBalance: 100,
        status: ShiftStatus.OPEN,
        cashMovements: [],
        cashRegister: { name: 'Caja 1', identifier: 'POS-01' },
        user: { name: 'Carlos Cajero' },
      };
      mockPrisma.cashShift.findUnique.mockResolvedValue(shiftData);
      mockPrisma.sale.findMany.mockResolvedValue([]);
      mockPrisma.cashShift.update.mockResolvedValue({
        ...shiftData,
        status: ShiftStatus.CLOSED,
        closedAt: new Date(),
      });

      const result = await service.closeShift('user-1', Role.CAJERO, {
        shiftId: 'shift-1',
        actualBalance: 100,
      });

      expect(result.isBlindAudit).toBe(true);
      expect((result as any).difference).toBeUndefined(); // Oculto al cajero
    });

    it('para un ADMIN debe calcular con exactitud la diferencia de arqueo (sobrante/faltante)', async () => {
      const shiftData = {
        id: 'shift-1',
        userId: 'user-1',
        initialBalance: 100, // S/ 100 inicial
        status: ShiftStatus.OPEN,
        cashMovements: [
          { type: CashMovementType.INCOME, amount: 50 }, // +50
          { type: CashMovementType.EXPENSE, amount: 20 }, // -20
        ],
        cashRegister: { name: 'Caja 1', identifier: 'POS-01' },
        user: { name: 'Carlos Cajero' },
      };
      mockPrisma.cashShift.findUnique.mockResolvedValue(shiftData);

      // Venta en efectivo de S/ 150
      mockPrisma.sale.findMany.mockResolvedValue([
        {
          id: 's1',
          saleNumber: 1,
          paymentMethod: 'CASH',
          cashPaid: 150,
          changeAmount: 0,
          digitalPaid: 0,
          totalAmount: 150,
          createdAt: new Date(),
          items: [],
        },
      ]);

      // Esperado en gaveta: 100 (inicio) + 150 (ventas) + 50 (ingreso) - 20 (egreso) = S/ 280.00
      // Cajero contó S/ 285.00 -> Sobrante de S/ +5.00
      mockPrisma.cashShift.update.mockResolvedValue({
        ...shiftData,
        status: ShiftStatus.CLOSED,
        closedAt: new Date(),
      });

      const result = await service.closeShift('admin-1', Role.ADMIN, {
        shiftId: 'shift-1',
        actualBalance: 285,
        notes: 'Sobrante de S/ 5 verificado',
      });

      expect(result.isBlindAudit).toBe(false);
      expect(result.expectedBalance).toBe(280);
      expect(result.actualBalance).toBe(285);
      expect(result.difference).toBe(5);
      expect(result.discrepancyType).toBe('SOBRANTE');
    });

    it('debe excluir ventas anuladas (isVoided: false) al calcular cashFromSales, garantizando cuadre exacto tras devolución de efectivo', async () => {
      const shiftData = {
        id: 'shift-1',
        userId: 'user-1',
        initialBalance: 100, // S/ 100 inicial
        status: ShiftStatus.OPEN,
        cashMovements: [],
        cashRegister: { name: 'Caja 1', identifier: 'POS-01' },
        user: { name: 'Carlos Cajero' },
      };
      mockPrisma.cashShift.findUnique.mockResolvedValue(shiftData);

      // Simular que findMany fue invocado con { cashShiftId: shift.id, isVoided: false }
      // Venta 1 activa (S/ 50), Venta 2 anulada (S/ 30 - no se retorna en la query porque isVoided: false)
      mockPrisma.sale.findMany.mockImplementation(async (args: any) => {
        expect(args.where.isVoided).toBe(false);
        return [
          {
            id: 's1',
            saleNumber: 1,
            paymentMethod: 'CASH',
            cashPaid: 50,
            changeAmount: 0,
            digitalPaid: 0,
            totalAmount: 50,
            createdAt: new Date(),
            items: [],
          },
        ];
      });

      // El cajero tenía S/ 100 iniciales, cobró S/ 50 de s1, cobró S/ 30 de s2 pero los devolvió al anular s2.
      // Total físico en gaveta: 100 + 50 = S/ 150.
      mockPrisma.cashShift.update.mockResolvedValue({
        ...shiftData,
        status: ShiftStatus.CLOSED,
        closedAt: new Date(),
      });

      const result = await service.closeShift('admin-1', Role.ADMIN, {
        shiftId: 'shift-1',
        actualBalance: 150,
      });

      // Saldo esperado debe ser exactamente 150 (100 inicial + 50 venta activa)
      expect(result.expectedBalance).toBe(150);
      expect(result.actualBalance).toBe(150);
      expect(result.difference).toBe(0);
      expect(result.discrepancyType).toBe('EXACTO');
    });
  });
});
