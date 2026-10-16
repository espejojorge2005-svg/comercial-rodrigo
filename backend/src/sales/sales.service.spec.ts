import { describe, it, expect, vi, beforeEach } from 'vitest';
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

  describe('Validación Financiera Estricta del Pago (Cuadre de Caja y Antifraude)', () => {
    it('debe rechazar venta si (cashPaid + digitalPaid) - changeAmount no coincide con el total', async () => {
      mockPrisma.cashShift = {
        findUnique: vi.fn().mockResolvedValue({
          id: 'shift-1',
          status: 'OPEN',
          cashRegister: { identifier: 'POS-01', name: 'Caja 1' },
        }),
      };
      mockPrisma.$transaction = vi.fn().mockImplementation(async (callback) => {
        const tx = {
          product: {
            findUnique: vi.fn().mockResolvedValue({
              id: 'p1',
              name: 'Arroz 1kg',
              isActive: true,
              currentStock: 10,
              costPrice: 3,
            }),
          },
        };
        return callback(tx);
      });

      await expect(
        salesService.createSale('user-1', {
          cashShiftId: 'shift-1',
          receiptType: ReceiptType.NOTA_VENTA,
          paymentMethod: 'CASH',
          cashPaid: 50, // Faltan 50 soles
          digitalPaid: 0,
          changeAmount: 0,
          items: [{ productId: 'p1', quantity: 1, unitPrice: 100, isWholesaleApplied: false }],
        }),
      ).rejects.toThrow('Inconsistencia financiera en el pago');
    });

    it('debe rechazar pago MIXTO si el vuelto es mayor al efectivo entregado (intento de cashback fraudulento)', async () => {
      mockPrisma.cashShift = {
        findUnique: vi.fn().mockResolvedValue({
          id: 'shift-1',
          status: 'OPEN',
          cashRegister: { identifier: 'POS-01', name: 'Caja 1' },
        }),
      };
      mockPrisma.$transaction = vi.fn().mockImplementation(async (callback) => {
        const tx = {
          product: {
            findUnique: vi.fn().mockResolvedValue({
              id: 'p1',
              name: 'Arroz 1kg',
              isActive: true,
              currentStock: 10,
              costPrice: 3,
            }),
          },
        };
        return callback(tx);
      });

        await expect(
        salesService.createSale('user-1', {
          cashShiftId: 'shift-1',
          receiptType: ReceiptType.NOTA_VENTA,
          paymentMethod: 'MIXED',
          cashPaid: 10,
          digitalPaid: 110,
          changeAmount: 20, // Suma cuadra a 100, pero vuelto 20 > efectivo 10!
          items: [{ productId: 'p1', quantity: 1, unitPrice: 100, isWholesaleApplied: false }],
        }),
      ).rejects.toThrow('el vuelto (S/ 20.00) no puede ser mayor al efectivo entregado (S/ 10.00)');
    });

    it('debe permitir venta con tolerancia de redondeo de hasta S/ 0.10 (ej. cuenta de S/ 14.99 con pago neto de S/ 15.00)', async () => {
      mockPrisma.cashShift = {
        findUnique: vi.fn().mockResolvedValue({
          id: 'shift-1',
          status: 'OPEN',
          cashRegister: { identifier: 'POS-01', name: 'Caja 1' },
        }),
      };
      mockPrisma.$transaction = vi.fn().mockImplementation(async (callback) => {
        const tx = {
          product: {
            findUnique: vi.fn().mockResolvedValue({
              id: 'p1',
              name: 'Arroz 1kg',
              isActive: true,
              currentStock: 10,
              costPrice: 3,
            }),
            update: vi.fn().mockResolvedValue({ currentStock: 9 }),
          },
          receiptSequence: {
            upsert: vi.fn().mockResolvedValue({ currentNumber: 1 }),
          },
          sale: {
            create: vi.fn().mockResolvedValue({
              id: 'sale-1',
              totalAmount: 14.99,
              cashPaid: 20,
              changeAmount: 5, // Neto = 15.00, diferencia = 0.01 (dentro de tolerancia de 0.10)
              items: [],
            }),
          },
          kardexMovement: {
            create: vi.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      });

      const res = await salesService.createSale('user-1', {
        cashShiftId: 'shift-1',
        receiptType: ReceiptType.NOTA_VENTA,
        paymentMethod: 'CASH',
        cashPaid: 20,
        digitalPaid: 0,
        changeAmount: 5,
        items: [{ productId: 'p1', quantity: 1, unitPrice: 14.99, isWholesaleApplied: false }],
      });

      expect(res).toBeDefined();
    });
  });

  describe('Canje de Ticket / Nota de Venta a Comprobante Electrónico', () => {
    it('debe rechazar el canje si la venta ya es de tipo BOLETA o FACTURA', async () => {
      mockPrisma.sale = {
        findUnique: vi.fn().mockResolvedValue({
          id: 'sale-already-fiscal',
          receiptType: ReceiptType.BOLETA,
          isVoided: false,
          totalAmount: 50,
        }),
      };

      await expect(
        salesService.convertSaleReceipt('sale-already-fiscal', 'user-1', {
          targetReceiptType: ReceiptType.FACTURA,
          customerDocument: '20601234567',
          customerName: 'EMPRESA SAC',
        }),
      ).rejects.toThrow('Solo las Notas de Venta (Tickets internos) pueden ser canjeadas');
    });

    it('debe rechazar el canje si la venta está anulada', async () => {
      mockPrisma.sale = {
        findUnique: vi.fn().mockResolvedValue({
          id: 'sale-voided',
          receiptType: ReceiptType.NOTA_VENTA,
          isVoided: true,
          totalAmount: 50,
        }),
      };

      await expect(
        salesService.convertSaleReceipt('sale-voided', 'user-1', {
          targetReceiptType: ReceiptType.BOLETA,
        }),
      ).rejects.toThrow('No se puede canjear una venta que se encuentra anulada');
    });

    it('debe rechazar Factura si el RUC no tiene 11 dígitos o no inicia con 10 o 20', async () => {
      mockPrisma.sale = {
        findUnique: vi.fn().mockResolvedValue({
          id: 'sale-nv',
          receiptType: ReceiptType.NOTA_VENTA,
          isVoided: false,
          totalAmount: 100,
        }),
      };

      await expect(
        salesService.convertSaleReceipt('sale-nv', 'user-1', {
          targetReceiptType: ReceiptType.FACTURA,
          customerDocument: '71234567', // DNI en vez de RUC
          customerName: 'EMPRESA SAC',
        }),
      ).rejects.toThrow('RUC válido de 11 dígitos');
    });

    it('debe canjear exitosamente Nota de Venta a Boleta Electrónica sin duplicar stock ni caja', async () => {
      mockPrisma.sale = {
        findUnique: vi.fn().mockResolvedValue({
          id: 'sale-nv-1',
          saleNumber: 45,
          receiptType: ReceiptType.NOTA_VENTA,
          series: 'NV01',
          correlativeNumber: 45,
          fullReceiptNumber: 'NV01-00000045',
          isVoided: false,
          totalAmount: 118,
          paymentMethod: 'CASH',
          items: [{ product: { name: 'Aceite Primor', unitType: 'NIU' }, quantity: 1, unitPrice: 118, subtotal: 118 }],
          cashShift: { cashRegister: { id: 'reg-1', identifier: 'POS-01', name: 'Caja 1' } },
          user: { id: 'user-1', name: 'Cajero' },
        }),
      };
      mockPrisma.cashShift = {
        findFirst: vi.fn().mockResolvedValue({
          id: 'shift-1',
          cashRegister: { id: 'reg-1', identifier: 'POS-01', name: 'Caja 1' },
        }),
      };
      mockPrisma.storeConfig = {
        findFirst: vi.fn().mockResolvedValue({ ruc: '10458923011' }),
      };
      mockPrisma.$transaction = vi.fn().mockImplementation(async (callback) => {
        const tx = {
          receiptSequence: {
            upsert: vi.fn().mockResolvedValue({ currentNumber: 12 }),
          },
          sale: {
            update: vi.fn().mockResolvedValue({
              id: 'sale-nv-1',
              receiptType: ReceiptType.BOLETA,
              series: 'B001',
              correlativeNumber: 12,
              fullReceiptNumber: 'B001-00000012',
              isFiscal: true,
              taxableBase: 100,
              igvAmount: 18,
              totalAmount: 118,
              voidedReason: 'CANJE_TICKET:NV01-00000045',
            }),
          },
        };
        return callback(tx);
      });
      mockBilling.issueReceipt.mockResolvedValue({
        success: true,
        hash: 'hash123',
        qrString: 'qr123',
        emissionStatus: 'ACCEPTED',
      });
      mockPrisma.sale.update = vi.fn().mockResolvedValue({
        id: 'sale-nv-1',
        fullReceiptNumber: 'B001-00000012',
        receiptType: ReceiptType.BOLETA,
        emissionStatus: 'ACCEPTED',
      });

      const result = await salesService.convertSaleReceipt('sale-nv-1', 'user-1', {
        targetReceiptType: ReceiptType.BOLETA,
        customerDocument: '71234567',
        customerName: 'Juan Perez',
      });

      expect(result.originalTicketNumber).toBe('NV01-00000045');
      expect(result.sale.fullReceiptNumber).toBe('B001-00000012');
      expect(mockBilling.issueReceipt).toHaveBeenCalled();
    });
  });
});

