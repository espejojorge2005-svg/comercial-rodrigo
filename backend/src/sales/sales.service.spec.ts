import { describe, it, expect, vi } from 'vitest';
import { SalesService } from './sales.service.js';
import { ReceiptType } from '@prisma/client';

describe('SalesService - Triple Vía Series & Fiscal Rules', () => {
  let salesService: SalesService;
  const mockPrisma = {} as any;
  const mockBilling = {
    issueReceipt: vi.fn(),
  } as any;

  beforeEach(() => {
    salesService = new SalesService(mockPrisma, mockBilling);
  });

  describe('Asignación de Series por Caja Física', () => {
    it('debe asignar NV01, B001 y F001 para Caja 1 (POS-01)', () => {
      const getSeries = (salesService as any).getSeriesForRegister.bind(salesService);

      expect(getSeries('POS-01', 'Caja 1', ReceiptType.NOTA_VENTA)).toBe('NV01');
      expect(getSeries('POS-01', 'Caja 1', ReceiptType.BOLETA)).toBe('B001');
      expect(getSeries('POS-01', 'Caja 1', ReceiptType.FACTURA)).toBe('F001');
    });

    it('debe asignar NV02, B002 y F002 para Caja 2 (POS-02)', () => {
      const getSeries = (salesService as any).getSeriesForRegister.bind(salesService);

      expect(getSeries('POS-02', 'Caja 2', ReceiptType.NOTA_VENTA)).toBe('NV02');
      expect(getSeries('POS-02', 'Caja 2', ReceiptType.BOLETA)).toBe('B002');
      expect(getSeries('POS-02', 'Caja 2', ReceiptType.FACTURA)).toBe('F002');
    });
  });

  describe('Validaciones de Factura', () => {
    it('debe rechazar Factura con RUC inválido (no 11 dígitos o prefijo no autorizado)', async () => {
      await expect(
        salesService.createSale('user-1', {
          cashShiftId: 'shift-1',
          receiptType: ReceiptType.FACTURA,
          customerDocument: '12345678901', // no inicia en 10, 20, 15, 17
          customerName: 'EMPRESA SAC',
          customerAddress: 'Av. Industrial 123',
          paymentMethod: 'CASH',
          cashPaid: 100,
          digitalPaid: 0,
          changeAmount: 0,
          items: [{ productId: 'p1', quantity: 1, unitPrice: 100, isWholesaleApplied: false }],
        }),
      ).rejects.toThrow('RUC válido de 11 dígitos que inicie con 10, 20, 15 o 17');
    });

    it('debe rechazar Factura sin Dirección Fiscal', async () => {
      await expect(
        salesService.createSale('user-1', {
          cashShiftId: 'shift-1',
          receiptType: ReceiptType.FACTURA,
          customerDocument: '20601234567',
          customerName: 'EMPRESA SAC',
          customerAddress: '', // Vacío
          paymentMethod: 'CASH',
          cashPaid: 100,
          digitalPaid: 0,
          changeAmount: 0,
          items: [{ productId: 'p1', quantity: 1, unitPrice: 100, isWholesaleApplied: false }],
        }),
      ).rejects.toThrow('Dirección Fiscal de la empresa es estrictamente obligatoria');
    });
  });
});
