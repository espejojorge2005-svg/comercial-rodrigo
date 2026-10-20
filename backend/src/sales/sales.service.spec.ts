import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SalesService } from './sales.service.js';
import { ReceiptType, EmissionStatus, PaymentMethod } from '@prisma/client';

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

  describe('Validaciones de Boleta >= S/ 700.00 (Exigencia Legal SUNAT)', () => {
    beforeEach(() => {
      mockPrisma.cashShift = {
        findUnique: vi.fn().mockResolvedValue({
          id: 'shift-1',
          status: 'OPEN',
          cashRegister: { id: 'reg-1', identifier: 'POS-01', name: 'Caja 1' },
        }),
      };
      mockPrisma.$transaction = vi.fn().mockImplementation(async (callback) => {
        const tx = {
          product: {
            findUnique: vi.fn().mockResolvedValue({
              id: 'p1',
              name: 'Saco de Azúcar 50kg',
              isActive: true,
              currentStock: 50,
              costPrice: 150,
            }),
            update: vi.fn().mockResolvedValue({
              id: 'p1',
              currentStock: 46,
            }),
          },
          receiptSequence: {
            upsert: vi.fn().mockResolvedValue({ currentNumber: 5 }),
          },
          sale: {
            create: vi.fn().mockResolvedValue({
              id: 'sale-700',
              saleNumber: 5,
              receiptType: ReceiptType.BOLETA,
              totalAmount: 800,
              items: [],
            }),
          },
          kardexMovement: {
            create: vi.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      });
      mockPrisma.storeConfig = {
        findFirst: vi.fn().mockResolvedValue({ ruc: '10458923011' }),
      };
      mockBilling.issueReceipt.mockResolvedValue({
        success: true,
        hash: 'hash-test',
        qrString: 'qr-test',
        emissionStatus: 'SIMULATED',
      });
      mockPrisma.sale = {
        findUnique: vi.fn().mockResolvedValue({
          id: 'sale-700',
          saleNumber: 5,
          receiptType: ReceiptType.BOLETA,
          totalAmount: 800,
          taxableBase: 677.97,
          igvAmount: 122.03,
          cashPaid: 800,
          digitalPaid: 0,
          changeAmount: 0,
          items: [],
        }),
        update: vi.fn().mockResolvedValue({
          id: 'sale-700',
          totalAmount: 800,
          items: [],
        }),
      };
    });

    it('debe rechazar Boleta >= S/ 700 si el documento tiene menos de 8 caracteres', async () => {
      await expect(
        salesService.createSale('user-1', {
          cashShiftId: 'shift-1',
          receiptType: ReceiptType.BOLETA,
          customerDocument: '1234567', // 7 dígitos
          customerName: 'JUAN PEREZ',
          paymentMethod: 'CASH',
          cashPaid: 800,
          digitalPaid: 0,
          changeAmount: 0,
          items: [{ productId: 'p1', quantity: 4, unitPrice: 200, isWholesaleApplied: false }],
        }),
      ).rejects.toThrow('SUNAT exige identificar al cliente con DNI, Carnet de Extranjería o RUC válido (8 a 12 caracteres)');
    });

    it('debe rechazar Boleta >= S/ 700 si el documento tiene más de 12 caracteres', async () => {
      await expect(
        salesService.createSale('user-1', {
          cashShiftId: 'shift-1',
          receiptType: ReceiptType.BOLETA,
          customerDocument: '1234567890123', // 13 caracteres
          customerName: 'JUAN PEREZ',
          paymentMethod: 'CASH',
          cashPaid: 800,
          digitalPaid: 0,
          changeAmount: 0,
          items: [{ productId: 'p1', quantity: 4, unitPrice: 200, isWholesaleApplied: false }],
        }),
      ).rejects.toThrow('SUNAT exige identificar al cliente con DNI, Carnet de Extranjería o RUC válido (8 a 12 caracteres)');
    });

    it('debe rechazar Boleta >= S/ 700 si el nombre es "Cliente Varios" o "CLIENTES VARIOS"', async () => {
      await expect(
        salesService.createSale('user-1', {
          cashShiftId: 'shift-1',
          receiptType: ReceiptType.BOLETA,
          customerDocument: '71234567',
          customerName: 'CLIENTES VARIOS',
          paymentMethod: 'CASH',
          cashPaid: 800,
          digitalPaid: 0,
          changeAmount: 0,
          items: [{ productId: 'p1', quantity: 4, unitPrice: 200, isWholesaleApplied: false }],
        }),
      ).rejects.toThrow('se requieren los nombres y apellidos completos del cliente');
    });

    it('debe permitir Boleta >= S/ 700 con Carnet de Extranjería (CE de 9 caracteres) y nombre completo', async () => {
      const result = await salesService.createSale('user-1', {
        cashShiftId: 'shift-1',
        receiptType: ReceiptType.BOLETA,
        customerDocument: '001234567', // Carnet de Extranjería (9 caracteres)
        customerName: 'Carlos Andres Rodriguez',
        paymentMethod: 'CASH',
        cashPaid: 800,
        digitalPaid: 0,
        changeAmount: 0,
        items: [{ productId: 'p1', quantity: 4, unitPrice: 200, isWholesaleApplied: false }],
      });

      expect(result.sale).toBeDefined();
      expect(result.sale.totalAmount).toBe(800);
    });

    it('debe permitir Boleta >= S/ 700 con RUC personal (11 dígitos) y nombre completo', async () => {
      const result = await salesService.createSale('user-1', {
        cashShiftId: 'shift-1',
        receiptType: ReceiptType.BOLETA,
        customerDocument: '10458923011', // RUC personal de 11 dígitos
        customerName: 'Juan Carlos Perez Gomez',
        paymentMethod: 'CASH',
        cashPaid: 800,
        digitalPaid: 0,
        changeAmount: 0,
        items: [{ productId: 'p1', quantity: 4, unitPrice: 200, isWholesaleApplied: false }],
      });

      expect(result.sale).toBeDefined();
      expect(result.sale.totalAmount).toBe(800);
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

    it('debe rechazar venta simultánea si otra caja agotó el stock en concurrencia (updateMany count === 0)', async () => {
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
              currentStock: 0,
              costPrice: 3,
            }),
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
          receiptSequence: {
            upsert: vi.fn().mockResolvedValue({ currentNumber: 1 }),
          },
          sale: {
            create: vi.fn().mockResolvedValue({ id: 'sale-1', items: [] }),
          },
        };
        return callback(tx);
      });

      await expect(
        salesService.createSale('user-1', {
          cashShiftId: 'shift-1',
          receiptType: ReceiptType.NOTA_VENTA,
          paymentMethod: 'CASH',
          cashPaid: 10,
          digitalPaid: 0,
          changeAmount: 0,
          items: [{ productId: 'p1', quantity: 1, unitPrice: 10, isWholesaleApplied: false }],
        }),
      ).rejects.toThrow('Stock insuficiente para "Arroz 1kg". Otra caja física acaba de vender las existencias');
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

    it('debe marcar la venta canjeada como REJECTED si el PSE rechaza la emisión', async () => {
      mockPrisma.sale = {
        findUnique: vi.fn().mockResolvedValue({
          id: 'sale-nv-rej',
          saleNumber: 46,
          receiptType: ReceiptType.NOTA_VENTA,
          series: 'NV01',
          correlativeNumber: 46,
          fullReceiptNumber: 'NV01-00000046',
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
            upsert: vi.fn().mockResolvedValue({ currentNumber: 13 }),
          },
          sale: {
            update: vi.fn().mockResolvedValue({
              id: 'sale-nv-rej',
              receiptType: ReceiptType.BOLETA,
              series: 'B001',
              correlativeNumber: 13,
              fullReceiptNumber: 'B001-00000013',
              isFiscal: true,
              taxableBase: 100,
              igvAmount: 18,
              totalAmount: 118,
            }),
          },
        };
        return callback(tx);
      });
      mockBilling.issueReceipt.mockResolvedValue({
        success: false,
        message: 'DNI no existe en RENIEC',
      });
      mockPrisma.sale.update = vi.fn().mockResolvedValue({
        id: 'sale-nv-rej',
        fullReceiptNumber: 'B001-00000013',
        receiptType: ReceiptType.BOLETA,
        emissionStatus: EmissionStatus.REJECTED,
      });

      const result = await salesService.convertSaleReceipt('sale-nv-rej', 'user-1', {
        targetReceiptType: ReceiptType.BOLETA,
        customerDocument: '71234567',
        customerName: 'Juan Perez',
      });

      expect(mockPrisma.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            emissionStatus: EmissionStatus.REJECTED,
          }),
        }),
      );
      expect(result.sale.emissionStatus).toBe(EmissionStatus.REJECTED);
    });

    it('debe calcular base imponible e IGV línea por línea en el canje para cuadre exacto con SIRE (evitando descuadre por redondeo global)', async () => {
      // 3 items de S/ 10.00 cada uno = S/ 30.00 total.
      // Global: 30 / 1.18 = 25.42 (IGV: 4.58)
      // Línea por línea SIRE / Nubefact: 10 / 1.18 = 8.47 (IGV: 1.53) * 3 = Base: 25.41 (IGV: 4.59)
      mockPrisma.sale = {
        findUnique: vi.fn().mockResolvedValue({
          id: 'sale-nv-sire',
          saleNumber: 47,
          receiptType: ReceiptType.NOTA_VENTA,
          series: 'NV01',
          correlativeNumber: 47,
          fullReceiptNumber: 'NV01-00000047',
          isVoided: false,
          totalAmount: 30,
          paymentMethod: 'CASH',
          items: [
            { product: { name: 'Item 1', unitType: 'NIU' }, quantity: 1, unitPrice: 10, subtotal: 10 },
            { product: { name: 'Item 2', unitType: 'NIU' }, quantity: 1, unitPrice: 10, subtotal: 10 },
            { product: { name: 'Item 3', unitType: 'NIU' }, quantity: 1, unitPrice: 10, subtotal: 10 },
          ],
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

      let capturedUpdateData: any = null;
      mockPrisma.$transaction = vi.fn().mockImplementation(async (callback) => {
        const tx = {
          receiptSequence: {
            upsert: vi.fn().mockResolvedValue({ currentNumber: 14 }),
          },
          sale: {
            update: vi.fn().mockImplementation(({ data }) => {
              capturedUpdateData = data;
              return Promise.resolve({
                id: 'sale-nv-sire',
                receiptType: ReceiptType.BOLETA,
                series: 'B001',
                correlativeNumber: 14,
                fullReceiptNumber: 'B001-00000014',
                isFiscal: true,
                taxableBase: Number(data.taxableBase),
                igvAmount: Number(data.igvAmount),
                totalAmount: 30,
              });
            }),
          },
        };
        return callback(tx);
      });
      mockBilling.issueReceipt.mockResolvedValue({
        success: true,
        hash: 'hashSire',
        qrString: 'qrSire',
        emissionStatus: 'ACCEPTED',
      });
      mockPrisma.sale.update = vi.fn().mockResolvedValue({
        id: 'sale-nv-sire',
        fullReceiptNumber: 'B001-00000014',
        receiptType: ReceiptType.BOLETA,
        emissionStatus: 'ACCEPTED',
      });

      await salesService.convertSaleReceipt('sale-nv-sire', 'user-1', {
        targetReceiptType: ReceiptType.BOLETA,
        customerDocument: '71234567',
        customerName: 'Juan Perez',
      });

      // Debe ser 25.41 y 4.59 (línea por línea), NO 25.42 y 4.58 (global)
      expect(Number(capturedUpdateData.taxableBase)).toBe(25.41);
      expect(Number(capturedUpdateData.igvAmount)).toBe(4.59);
      expect(mockBilling.issueReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          taxableBase: 25.41,
          igvAmount: 4.59,
        }),
      );
    });
  });

  describe('Sincronizador Offline (syncOfflineSales)', () => {
    it('debe actualizar emissionStatus a REJECTED si el PSE reporta rechazo formal', async () => {
      mockPrisma.cashShift = {
        findUnique: vi.fn().mockResolvedValue({
          id: 'shift-1',
          status: 'OPEN',
          cashRegisterId: 'reg-1',
          cashRegister: { id: 'reg-1', identifier: 'POS-01', name: 'Caja 1' },
        }),
        findFirst: vi.fn().mockResolvedValue({
          id: 'shift-1',
          status: 'OPEN',
          cashRegisterId: 'reg-1',
          cashRegister: { id: 'reg-1', identifier: 'POS-01', name: 'Caja 1' },
        }),
      };
      mockPrisma.kardexMovement = {
        findFirst: vi.fn().mockResolvedValue(null),
      };
      mockPrisma.$transaction = vi.fn().mockImplementation(async (callback) => {
        const tx = {
          product: {
            findUnique: vi.fn().mockResolvedValue({
              id: 'p1',
              name: 'Arroz 1kg',
              isActive: true,
              currentStock: 50,
              costPrice: 3,
            }),
            update: vi.fn().mockResolvedValue({
              id: 'p1',
              currentStock: 49,
            }),
          },
          receiptSequence: {
            upsert: vi.fn().mockResolvedValue({ currentNumber: 88 }),
          },
          sale: {
            create: vi.fn().mockResolvedValue({
              id: 'sale-off-1',
              saleNumber: 88,
              receiptType: ReceiptType.BOLETA,
              series: 'B001',
              correlativeNumber: 88,
              fullReceiptNumber: 'B001-00000088',
              totalAmount: 100,
              emissionStatus: EmissionStatus.PENDING,
              items: [],
            }),
          },
          kardexMovement: {
            create: vi.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      });
      mockPrisma.storeConfig = {
        findFirst: vi.fn().mockResolvedValue({ ruc: '10458923011' }),
      };
      mockBilling.issueReceipt.mockResolvedValue({
        success: false,
        message: 'DNI no encontrado en padrón RENIEC',
      });
      mockPrisma.sale = {
        update: vi.fn().mockResolvedValue({
          id: 'sale-off-1',
          fullReceiptNumber: 'B001-00000088',
          receiptType: ReceiptType.BOLETA,
          emissionStatus: EmissionStatus.REJECTED,
          totalAmount: 100,
          taxableBase: 84.75,
          igvAmount: 15.25,
          cashPaid: 100,
          digitalPaid: 0,
          changeAmount: 0,
          items: [],
        }),
      };

      const syncResult = await salesService.syncOfflineSales('user-1', {
        sales: [
          {
            offlineId: 'off-uuid-1',
            cashShiftId: 'shift-1',
            createdAt: new Date().toISOString(),
            receiptType: ReceiptType.BOLETA,
            paymentMethod: PaymentMethod.CASH,
            cashPaid: 100,
            digitalPaid: 0,
            changeAmount: 0,
            customerName: 'JUAN PEREZ',
            customerDocument: '71234567',
            items: [
              {
                productId: 'p1',
                quantity: 1,
                unitPrice: 100,
                isWholesaleApplied: false,
              },
            ],
          },
        ],
      });

      expect(syncResult.syncedCount).toBe(1);
      expect(mockPrisma.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            emissionStatus: EmissionStatus.REJECTED,
          }),
        }),
      );
      expect(syncResult.results[0].sale.emissionStatus).toBe(EmissionStatus.REJECTED);
    });
  });

  describe('Anulaciones y Conciliación Financiera (voidSale)', () => {
    it('debe registrar un egreso automático en el turno abierto si se anula una venta de un turno ya CERRADO', async () => {
      mockPrisma.user = {
        findFirst: vi.fn().mockResolvedValue({
          id: 'admin-1',
          name: 'Admin Test',
          pin: '1234',
        }),
      };

      mockPrisma.sale = {
        findUnique: vi.fn().mockResolvedValue({
          id: 'sale-old-1',
          saleNumber: 10,
          fullReceiptNumber: 'NV01-00000010',
          receiptType: ReceiptType.NOTA_VENTA,
          totalAmount: 50,
          cashPaid: 50,
          changeAmount: 0,
          digitalPaid: 0,
          paymentMethod: PaymentMethod.CASH,
          isVoided: false,
          items: [{ productId: 'p1', quantity: 2, product: { id: 'p1', costPrice: 15 } }],
          cashShiftId: 'shift-yesterday',
          cashShift: {
            id: 'shift-yesterday',
            status: 'CLOSED', // ⚠️ Turno cerrado ayer
            cashRegisterId: 'reg-1',
            cashRegister: { id: 'reg-1', identifier: 'POS-01', name: 'Caja 1' },
          },
        }),
      };

      let createdMovement: any = null;
      mockPrisma.$transaction = vi.fn().mockImplementation(async (callback) => {
        const tx = {
          product: {
            update: vi.fn().mockResolvedValue({ id: 'p1', currentStock: 12, costPrice: 15 }),
          },
          kardexMovement: {
            create: vi.fn().mockResolvedValue({}),
          },
          sale: {
            update: vi.fn().mockResolvedValue({ id: 'sale-old-1', saleNumber: 10, isVoided: true }),
          },
          cashShift: {
            findFirst: vi.fn().mockResolvedValue({
              id: 'shift-today-open',
              status: 'OPEN',
              cashRegisterId: 'reg-1',
            }),
          },
          cashMovement: {
            create: vi.fn().mockImplementation(({ data }) => {
              createdMovement = data;
              return Promise.resolve(data);
            }),
          },
        };
        return callback(tx);
      });

      const res = await salesService.voidSale('sale-old-1', {
        adminPin: '1234',
        reason: 'Cliente devuelve producto por defecto',
      });

      expect(res.saleId).toBe('sale-old-1');
      expect(createdMovement).toBeDefined();
      expect(createdMovement.cashShiftId).toBe('shift-today-open');
      expect(createdMovement.type).toBe('EXPENSE');
      expect(Number(createdMovement.amount)).toBe(50);
      expect(createdMovement.reason).toContain('Turno anterior');
    });
  });
});

