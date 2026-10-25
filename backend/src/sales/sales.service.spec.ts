import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SalesService,
  isValidPeruvianRuc,
  getSunatCompliantEmissionDate,
  getSunatCreditNoteDeadline,
} from './sales.service.js';
import { ReceiptType, EmissionStatus, PaymentMethod } from '@prisma/client';
import * as bcrypt from 'bcrypt';

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
          customerName: 'DISTRIBUIDORA NORTE S.A.C.',
          customerAddress: 'Av. Industrial 123',
          paymentMethod: 'CASH',
          cashPaid: 100,
          digitalPaid: 0,
          changeAmount: 0,
          items: [{ productId: 'p1', quantity: 1, unitPrice: 100, isWholesaleApplied: false }],
        }),
      ).rejects.toThrow('RUC válido de 11 dígitos que inicie con 10, 20, 15 o 17');
    });

    it('debe rechazar Factura si el RUC tiene 10 dígitos o contiene caracteres no numéricos', async () => {
      for (const invalidRuc of ['2012345678', '2060123456A', '201234567890', '']) {
        await expect(
          salesService.createSale('user-1', {
            cashShiftId: 'shift-1',
            receiptType: ReceiptType.FACTURA,
            customerDocument: invalidRuc,
            customerName: 'DISTRIBUIDORA NORTE S.A.C.',
            customerAddress: 'Av. Industrial 123',
            paymentMethod: 'CASH',
            cashPaid: 100,
            digitalPaid: 0,
            changeAmount: 0,
            items: [{ productId: 'p1', quantity: 1, unitPrice: 100, isWholesaleApplied: false }],
          }),
        ).rejects.toThrow('RUC válido de 11 dígitos que inicie con 10, 20, 15 o 17');
      }
    });

    it('debe rechazar Factura con Razón Social ficticia o genérica (EMPRESA, EMPRESA SAC, Cliente Varios)', async () => {
      for (const fakeName of ['EMPRESA', 'EMPRESA SAC', 'EMPRESA S.A.C.', 'Cliente Varios', 'CLIENTES VARIOS']) {
        await expect(
          salesService.createSale('user-1', {
            cashShiftId: 'shift-1',
            receiptType: ReceiptType.FACTURA,
            customerDocument: '20601234567',
            customerName: fakeName,
            customerAddress: 'Av. Los Ficus 456',
            paymentMethod: 'CASH',
            cashPaid: 100,
            digitalPaid: 0,
            changeAmount: 0,
            items: [{ productId: 'p1', quantity: 1, unitPrice: 100, isWholesaleApplied: false }],
          }),
        ).rejects.toThrow('La Razón Social de la empresa es estrictamente obligatoria para emitir Factura');
      }
    });

    it('debe rechazar Factura sin Dirección Fiscal', async () => {
      await expect(
        salesService.createSale('user-1', {
          cashShiftId: 'shift-1',
          receiptType: ReceiptType.FACTURA,
          customerDocument: '20601234567',
          customerName: 'DISTRIBUIDORA NORTE S.A.C.',
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

  describe('Hallazgo Medio 2.3: Consolidación de Productos Duplicados en una misma Venta', () => {
    it('debe consolidar líneas duplicadas del mismo producto, sumar cantidades y ordenar determinísticamente por productId', async () => {
      mockPrisma.cashShift = {
        findUnique: vi.fn().mockResolvedValue({
          id: 'shift-1',
          status: 'OPEN',
          cashRegister: { id: 'reg-1', identifier: 'POS-01', name: 'Caja 1' },
        }),
      };

      const productP1 = {
        id: 'p1',
        name: 'Arroz Superior 50kg',
        isActive: true,
        currentStock: 10,
        costPrice: 120,
      };
      const productP2 = {
        id: 'p2',
        name: 'Aceite Vegetal 1L',
        isActive: true,
        currentStock: 20,
        costPrice: 7,
      };

      let createdSaleData: any = null;

      mockPrisma.$transaction = vi.fn().mockImplementation(async (callback) => {
        const tx = {
          product: {
            findUnique: vi.fn().mockImplementation(({ where }) => {
              if (where.id === 'p1') return Promise.resolve(productP1);
              if (where.id === 'p2') return Promise.resolve(productP2);
              return Promise.resolve(null);
            }),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          receiptSequence: {
            upsert: vi.fn().mockResolvedValue({ currentNumber: 88 }),
          },
          sale: {
            create: vi.fn().mockImplementation(({ data }) => {
              createdSaleData = data;
              return Promise.resolve({
                id: 'sale-merged-1',
                saleNumber: 88,
                totalAmount: data.totalAmount,
                taxableBase: data.taxableBase,
                igvAmount: data.igvAmount,
                cashPaid: data.cashPaid,
                digitalPaid: data.digitalPaid,
                changeAmount: data.changeAmount,
                items: (data.items?.create || []).map((detail: any, idx: number) => ({
                  id: `detail-${idx}`,
                  productId: detail.productId,
                  quantity: detail.quantity,
                  unitPrice: detail.unitPrice,
                  subtotal: detail.subtotal,
                  product: detail.productId === 'p1' ? productP1 : productP2,
                })),
                cashShift: { cashRegister: { name: 'Caja 1' } },
                user: { id: 'user-1', name: 'User Test' },
              });
            }),
          },
          kardexMovement: {
            create: vi.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      });

      // Enviamos ítems desordenados y duplicados: p2, luego p1 (2 unidades), luego p1 (3 unidades)
      const res = await salesService.createSale('user-1', {
        cashShiftId: 'shift-1',
        receiptType: ReceiptType.NOTA_VENTA,
        paymentMethod: 'CASH',
        cashPaid: 200,
        digitalPaid: 0,
        changeAmount: 0,
        items: [
          { productId: 'p2', quantity: 2, unitPrice: 10, isWholesaleApplied: false },
          { productId: 'p1', quantity: 2, unitPrice: 36, isWholesaleApplied: false },
          { productId: 'p1', quantity: 3, unitPrice: 36, isWholesaleApplied: false },
        ],
      });

      expect(res.sale).toBeDefined();
      // Las líneas de p1 deben haberse consolidado: 2 + 3 = 5 unidades
      expect(createdSaleData.items.create).toHaveLength(2);
      // Ordenamiento determinista: 'p1' primero, luego 'p2' (p1.localeCompare(p2))
      expect(createdSaleData.items.create[0].productId).toBe('p1');
      expect(Number(createdSaleData.items.create[0].quantity)).toBe(5);
      expect(createdSaleData.items.create[1].productId).toBe('p2');
      expect(Number(createdSaleData.items.create[1].quantity)).toBe(2);
      // Total: (5 * 36) + (2 * 10) = 180 + 20 = 200
      expect(Number(res.sale.totalAmount)).toBe(200);
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
            findUnique: vi
              .fn()
              .mockResolvedValueOnce({
                id: 'p1',
                name: 'Arroz 1kg',
                isActive: true,
                currentStock: 10,
                costPrice: 3,
              })
              .mockResolvedValueOnce({
                currentStock: 0,
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

    it('debe autorizar voidSale con PIN de Administrador hasheado con bcrypt', async () => {
      const hashedPin = await bcrypt.hash('9876', 10);
      mockPrisma.user = {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'admin-bcrypt',
            name: 'Admin Bcrypt',
            pin: hashedPin,
          },
        ]),
      };

      mockPrisma.sale = {
        findUnique: vi.fn().mockResolvedValue({
          id: 'sale-bcrypt-1',
          saleNumber: 15,
          fullReceiptNumber: 'NV01-00000015',
          receiptType: ReceiptType.NOTA_VENTA,
          totalAmount: 30,
          cashPaid: 30,
          changeAmount: 0,
          digitalPaid: 0,
          paymentMethod: PaymentMethod.CASH,
          isVoided: false,
          items: [{ productId: 'p1', quantity: 1, product: { id: 'p1', costPrice: 10 } }],
          cashShiftId: 'shift-open',
          cashShift: {
            id: 'shift-open',
            status: 'OPEN',
            cashRegisterId: 'reg-1',
            cashRegister: { id: 'reg-1', identifier: 'POS-01', name: 'Caja 1' },
          },
        }),
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (callback) => {
        const tx = {
          product: { update: vi.fn().mockResolvedValue({ id: 'p1', currentStock: 10, costPrice: 10 }) },
          kardexMovement: { create: vi.fn().mockResolvedValue({}) },
          sale: { update: vi.fn().mockResolvedValue({ id: 'sale-bcrypt-1', saleNumber: 15, isVoided: true }) },
        };
        return callback(tx);
      });

      const res = await salesService.voidSale('sale-bcrypt-1', {
        adminPin: '9876',
        reason: 'Error de cobro autorizado por administrador',
      });

      expect(res.saleId).toBe('sale-bcrypt-1');
    });
  });

  describe('Hallazgo 1.5 - Validador de RUC Algoritmo Módulo 11 (SUNAT)', () => {
    it('debe validar RUCs reales peruanos como válidos', () => {
      expect(isValidPeruvianRuc('20100107482')).toBe(true); // BCP
      expect(isValidPeruvianRuc('20100010721')).toBe(true); // Gloria
      expect(isValidPeruvianRuc('20100055237')).toBe(true); // Alicorp
      expect(isValidPeruvianRuc('20100070970')).toBe(true); // Supermercados Peruanos
    });

    it('debe rechazar RUCs con dígito verificador adulterado o erróneo', () => {
      expect(isValidPeruvianRuc('20100107489')).toBe(false); // Último dígito alterado (debe ser 2)
      expect(isValidPeruvianRuc('20100010729')).toBe(false); // Último dígito alterado (debe ser 1)
      expect(isValidPeruvianRuc('12345678901')).toBe(false); // Prefijo no autorizado
      expect(isValidPeruvianRuc('123')).toBe(false);
    });

    it('debe rechazar RUCs no válidos en lookupDocument con BadRequestException', async () => {
      await expect(salesService.lookupDocument('20100107489')).rejects.toThrow(
        'dígito verificador de SUNAT incorrecto',
      );
    });

    it('debe retornar NOT_FOUND sin inventar empresas ficticias si no existe en API ni en BD', async () => {
      mockPrisma.sale = {
        findFirst: vi.fn().mockResolvedValue(null),
      };

      const res = await salesService.lookupDocument('20505411219'); // RUC válido matemáticamente pero no en padrón mock
      expect(res.source).toBe('NOT_FOUND');
      expect(res.name).toBe('');
      expect(res.address).toBe('');
      expect(res.status).toBe('DESCONOCIDO');
    });

    it('debe recuperar la Razón Social real del historial local si el cliente ya compró antes', async () => {
      mockPrisma.sale = {
        findFirst: vi.fn().mockResolvedValue({
          customerName: 'INVERSIONES SANTA ROSA E.I.R.L.',
          customerAddress: 'Av. Las Gardenias 450, Surco',
        }),
      };

      const res = await salesService.lookupDocument('20505411219');
      expect(res.source).toBe('LOCAL_HISTORY');
      expect(res.name).toBe('INVERSIONES SANTA ROSA E.I.R.L.');
      expect(res.address).toBe('Av. Las Gardenias 450, Surco');
    });
  });

  describe('Hallazgo 1.4 - Plazo de Envío SUNAT (1 día calendario - R.S. 000003-2023)', () => {
    it('debe mantener la fecha original si la emisión fue hoy o ayer', () => {
      const today = new Date();
      const checkToday = getSunatCompliantEmissionDate(today);
      expect(checkToday.wasAdjusted).toBe(false);

      const yesterday = new Date(Date.now() - 24 * 3600000);
      const checkYesterday = getSunatCompliantEmissionDate(yesterday);
      expect(checkYesterday.wasAdjusted).toBe(false);
    });

    it('debe ajustar a la fecha actual si la fecha original tiene 2 o más días de antigüedad', () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600000);
      const check = getSunatCompliantEmissionDate(threeDaysAgo);
      expect(check.wasAdjusted).toBe(true);
      expect(check.emissionDate.getDate()).toBe(new Date().getDate());
    });

    it('reemitPendingSale debe actualizar fecha si supera plazo y emitir exitosamente ante SUNAT', async () => {
      const oldDate = new Date(Date.now() - 5 * 24 * 3600000); // 5 días de antigüedad
      mockPrisma.sale = {
        findUnique: vi.fn().mockResolvedValue({
          id: 'sale-pending-1',
          isFiscal: true,
          receiptType: ReceiptType.BOLETA,
          series: 'B001',
          correlativeNumber: 15,
          totalAmount: 118,
          taxableBase: 100,
          igvAmount: 18,
          createdAt: oldDate,
          emissionStatus: EmissionStatus.PENDING,
          items: [
            {
              quantity: 1,
              unitPrice: 118,
              subtotal: 118,
              product: { id: 'p1', name: 'Arroz', unitType: 'KGM' },
            },
          ],
          cashShift: { cashRegister: { name: 'Caja 1' } },
        }),
        update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'sale-pending-1', ...data })),
      };
      mockPrisma.storeConfig = {
        findFirst: vi.fn().mockResolvedValue({ ruc: '10458923011' }),
      };
      mockBilling.issueReceipt.mockResolvedValue({
        success: true,
        emissionStatus: EmissionStatus.ACCEPTED,
        hash: 'hash-abc',
        qrString: 'qr-abc',
        externalId: 'ext-123',
      });

      const result = await salesService.reemitPendingSale('sale-pending-1');
      expect(result.success).toBe(true);
      expect(mockPrisma.sale.update).toHaveBeenCalled();
      expect(mockBilling.issueReceipt).toHaveBeenCalled();
    });
  });

  describe('Hallazgo 2.1 - Prevención de Colisión de Series por Caja Física', () => {
    it('debe reutilizar la serie ya asignada a la caja en ReceiptSequence', async () => {
      const tx = {
        receiptSequence: {
          findUnique: vi.fn().mockResolvedValue({
            series: 'B005',
            cashRegisterId: 'reg-5',
          }),
        },
      };

      const series = await salesService.getOrAllocateSeries(
        tx,
        'reg-5',
        'POS-01',
        'Caja Principal',
        ReceiptType.BOLETA,
      );

      expect(series).toBe('B005');
    });

    it('debe detectar colisión si otra caja ya posee la serie y asignar la siguiente libre', async () => {
      const tx = {
        receiptSequence: {
          findUnique: vi.fn().mockImplementation(({ where }) => {
            if (where.cashRegisterId_receiptType) return Promise.resolve(null);
            // Si consulta B001, está ocupada por OTRA caja ('reg-caja-1')
            if (where.series === 'B001') {
              return Promise.resolve({ series: 'B001', cashRegisterId: 'reg-caja-1' });
            }
            // B002 está libre
            return Promise.resolve(null);
          }),
        },
      };

      const series = await salesService.getOrAllocateSeries(
        tx,
        'reg-caja-2',
        'POS-01', // Ambas cajas tenían identificador similar
        'Caja 1',
        ReceiptType.BOLETA,
      );

      // Se reasigna automáticamente a B002 para evitar colisión entre cajas
      expect(series).toBe('B002');
    });
  });

  describe('Zero-Trust Pricing (Prevención de Manipulación de Precios)', () => {
    const mockProductP1 = {
      id: 'prod-priced-1',
      name: 'Arroz Extra Costeño 5kg',
      isActive: true,
      currentStock: 50,
      costPrice: 20.0,
      retailPrice: 25.0,
      wholesalePrice: 22.0,
      wholesaleMinQty: 5,
    };

    beforeEach(() => {
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
            findUnique: vi.fn().mockImplementation(({ where }) => {
              if (where.id === 'prod-priced-1') return Promise.resolve(mockProductP1);
              return Promise.resolve(null);
            }),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          receiptSequence: {
            upsert: vi.fn().mockResolvedValue({ currentNumber: 101 }),
          },
          sale: {
            create: vi.fn().mockImplementation(({ data }) =>
              Promise.resolve({
                id: 'sale-ztp-1',
                saleNumber: 101,
                ...data,
                items: [],
              }),
            ),
          },
          kardexMovement: {
            create: vi.fn().mockResolvedValue({}),
          },
          user: {
            findMany: vi.fn().mockResolvedValue([
              { id: 'admin-1', name: 'Admin Rodrigo', pin: '5555' },
            ]),
          },
        };
        return callback(tx);
      });
    });

    it('debe rechazar la venta si el unitPrice enviado es menor al precio oficial (retailPrice) y no se envía adminPin', async () => {
      // Precio catálogo es S/ 25.00, pero payload envía S/ 15.00
      await expect(
        salesService.createSale('user-1', {
          cashShiftId: 'shift-1',
          receiptType: ReceiptType.NOTA_VENTA,
          paymentMethod: PaymentMethod.CASH,
          cashPaid: 15,
          digitalPaid: 0,
          changeAmount: 0,
          items: [
            {
              productId: 'prod-priced-1',
              quantity: 1,
              unitPrice: 15, // Manipulado o descuento no autorizado
              isWholesaleApplied: false,
            },
          ],
        }),
      ).rejects.toThrow('Se requiere autorización con PIN de Administrador');
    });

    it('debe rechazar la venta si el unitPrice es menor al catálogo y el adminPin es inválido', async () => {
      await expect(
        salesService.createSale('user-1', {
          cashShiftId: 'shift-1',
          receiptType: ReceiptType.NOTA_VENTA,
          paymentMethod: PaymentMethod.CASH,
          cashPaid: 15,
          digitalPaid: 0,
          changeAmount: 0,
          adminPin: '9999', // PIN incorrecto
          items: [
            {
              productId: 'prod-priced-1',
              quantity: 1,
              unitPrice: 15,
              isWholesaleApplied: false,
            },
          ],
        }),
      ).rejects.toThrow('PIN de Administrador inválido');
    });

    it('debe autorizar la venta con precio rebajado si se envía un adminPin válido', async () => {
      const res = await salesService.createSale('user-1', {
        cashShiftId: 'shift-1',
        receiptType: ReceiptType.NOTA_VENTA,
        paymentMethod: PaymentMethod.CASH,
        cashPaid: 18,
        digitalPaid: 0,
        changeAmount: 0,
        adminPin: '5555', // PIN correcto de admin
        items: [
          {
            productId: 'prod-priced-1',
            quantity: 1,
            unitPrice: 18,
            isWholesaleApplied: false,
          },
        ],
      });

      expect(res.sale).toBeDefined();
      expect(res.sale.totalAmount).toBe(18);
    });

    it('debe permitir la venta sin adminPin si se cobra el precio mayorista oficial y califica para mayorista', async () => {
      // wholesalePrice es 22.00, cantidad 5 >= wholesaleMinQty 5
      const res = await salesService.createSale('user-1', {
        cashShiftId: 'shift-1',
        receiptType: ReceiptType.NOTA_VENTA,
        paymentMethod: PaymentMethod.CASH,
        cashPaid: 110,
        digitalPaid: 0,
        changeAmount: 0,
        items: [
          {
            productId: 'prod-priced-1',
            quantity: 5,
            unitPrice: 22, // Precio mayorista oficial
            isWholesaleApplied: true,
          },
        ],
      });

      expect(res.sale).toBeDefined();
      expect(res.sale.totalAmount).toBe(110);
    });

    it('debe exigir adminPin si el unitPrice es menor al precio mayorista oficial incluso aplicando mayorista', async () => {
      // wholesalePrice es 22.00, pero envían 20.00 sin adminPin
      await expect(
        salesService.createSale('user-1', {
          cashShiftId: 'shift-1',
          receiptType: ReceiptType.NOTA_VENTA,
          paymentMethod: PaymentMethod.CASH,
          cashPaid: 100,
          digitalPaid: 0,
          changeAmount: 0,
          items: [
            {
              productId: 'prod-priced-1',
              quantity: 5,
              unitPrice: 20, // Menor a wholesalePrice (22.00)
              isWholesaleApplied: true,
            },
          ],
        }),
      ).rejects.toThrow('Se requiere autorización con PIN de Administrador');
    });

    it('debe permitir venta estándar sin adminPin cuando unitPrice es igual o mayor a retailPrice', async () => {
      const res = await salesService.createSale('user-1', {
        cashShiftId: 'shift-1',
        receiptType: ReceiptType.NOTA_VENTA,
        paymentMethod: PaymentMethod.CASH,
        cashPaid: 50,
        digitalPaid: 0,
        changeAmount: 0,
        items: [
          {
            productId: 'prod-priced-1',
            quantity: 2,
            unitPrice: 25, // Precio oficial retail
            isWholesaleApplied: false,
          },
        ],
      });

      expect(res.sale).toBeDefined();
      expect(res.sale.totalAmount).toBe(50);
    });
  });

  describe('Control de Anulaciones y Plazo Legal SUNAT en Notas de Crédito (R.S. 193-2020)', () => {
    it('debe calcular correctamente el 15° día hábil del mes siguiente a la emisión', () => {
      // Venta emitida el 15 de enero de 2026
      // Mes siguiente: Febrero 2026.
      // Días hábiles de Feb 2026 (excluyendo sábados y domingos):
      // Feb 2(1), 3(2), 4(3), 5(4), 6(5), 9(6), 10(7), 11(8), 12(9), 13(10), 16(11), 17(12), 18(13), 19(14), 20(15)
      // Plazo límite: 2026-02-20
      const emissionJan = new Date('2026-01-15T10:00:00Z');
      const info1 = getSunatCreditNoteDeadline(emissionJan, new Date('2026-02-10T12:00:00Z'));
      expect(info1.formattedDeadline).toBe('2026-02-20');
      expect(info1.isExpired).toBe(false);

      const infoExpired = getSunatCreditNoteDeadline(emissionJan, new Date('2026-02-21T08:00:00Z'));
      expect(infoExpired.isExpired).toBe(true);
    });

    it('debe rechazar anulación de Factura con plazo SUNAT vencido', async () => {
      mockPrisma.user = {
        findMany: vi.fn().mockResolvedValue([
          { id: 'admin-1', role: 'ADMIN', isActive: true, pin: '1234' },
        ]),
      };

      mockPrisma.sale = {
        findUnique: vi.fn().mockResolvedValue({
          id: 'sale-old-fiscal',
          receiptType: ReceiptType.FACTURA,
          fullReceiptNumber: 'F001-00000123',
          isVoided: false,
          createdAt: new Date('2025-10-01T15:00:00Z'),
          items: [],
          cashShift: { cashRegister: { identifier: 'POS-01', name: 'Caja 1' } },
        }),
      };

      await expect(
        salesService.voidSale('sale-old-fiscal', {
          adminPin: '1234',
          reason: 'Cliente devolvió mercadería meses después',
          sunatReasonCode: '01',
        }),
      ).rejects.toThrow(
        'No es posible anular este comprobante electrónico ante SUNAT. El plazo legal reglamentario',
      );
    });

    it('debe rechazar anulación de Boleta con plazo SUNAT vencido', async () => {
      mockPrisma.user = {
        findMany: vi.fn().mockResolvedValue([
          { id: 'admin-1', role: 'ADMIN', isActive: true, pin: '1234' },
        ]),
      };

      mockPrisma.sale = {
        findUnique: vi.fn().mockResolvedValue({
          id: 'sale-old-boleta',
          receiptType: ReceiptType.BOLETA,
          fullReceiptNumber: 'B001-00000456',
          isVoided: false,
          createdAt: new Date('2025-11-05T12:00:00Z'),
          items: [],
          cashShift: { cashRegister: { identifier: 'POS-01', name: 'Caja 1' } },
        }),
      };

      await expect(
        salesService.voidSale('sale-old-boleta', {
          adminPin: '1234',
          reason: 'Error de digitación meses después',
        }),
      ).rejects.toThrow('No es posible anular este comprobante electrónico ante SUNAT');
    });

    it('no debe bloquear por plazo SUNAT las Notas de Venta internas (NOTA_VENTA)', async () => {
      mockPrisma.user = {
        findMany: vi.fn().mockResolvedValue([
          { id: 'admin-1', role: 'ADMIN', isActive: true, pin: '1234' },
        ]),
      };

      mockPrisma.sale = {
        findUnique: vi.fn().mockResolvedValue({
          id: 'sale-old-nv',
          receiptType: ReceiptType.NOTA_VENTA,
          saleNumber: 'NV01-00000999',
          isVoided: false,
          createdAt: new Date('2024-01-01T12:00:00Z'),
          totalAmount: 100,
          cashShiftId: 'shift-1',
          cashShift: {
            cashRegisterId: 'reg-1',
            cashRegister: { identifier: 'POS-01', name: 'Caja 1' },
          },
          items: [],
        }),
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (cb) => {
        return cb({
          sale: { update: vi.fn().mockResolvedValue({ id: 'sale-old-nv', isVoided: true }) },
          cashShift: { update: vi.fn().mockResolvedValue({}) },
          kardexMovement: { create: vi.fn().mockResolvedValue({}) },
          product: { update: vi.fn().mockResolvedValue({}) },
          cashMovement: { create: vi.fn().mockResolvedValue({}) },
        });
      });

      const result = await salesService.voidSale('sale-old-nv', {
        adminPin: '1234',
        reason: 'Ajuste interno',
      });

      expect(result).toBeDefined();
      expect(result.message).toContain('anulada');
    });

    it('al anular una venta de un turno ABIERTO, no debe generar CashMovement de egreso (evita doble resta en arqueo)', async () => {
      mockPrisma.user = {
        findMany: vi.fn().mockResolvedValue([
          { id: 'admin-1', role: 'ADMIN', isActive: true, pin: '1234' },
        ]),
      };

      mockPrisma.sale = {
        findUnique: vi.fn().mockResolvedValue({
          id: 'sale-open-shift',
          receiptType: ReceiptType.NOTA_VENTA,
          saleNumber: 'NV01-00000010',
          isVoided: false,
          createdAt: new Date(),
          paymentMethod: PaymentMethod.CASH,
          cashPaid: 50,
          changeAmount: 0,
          totalAmount: 50,
          cashShiftId: 'shift-open',
          cashShift: {
            id: 'shift-open',
            status: ShiftStatus.OPEN, // Turno aún ABIERTO
            cashRegisterId: 'reg-1',
            cashRegister: { identifier: 'POS-01', name: 'Caja 1' },
          },
          items: [],
        }),
      };

      const mockCashMovementCreate = vi.fn();
      mockPrisma.$transaction = vi.fn().mockImplementation(async (cb) => {
        return cb({
          sale: { update: vi.fn().mockResolvedValue({ id: 'sale-open-shift', isVoided: true }) },
          cashShift: { update: vi.fn().mockResolvedValue({}) },
          kardexMovement: { create: vi.fn().mockResolvedValue({}) },
          product: { update: vi.fn().mockResolvedValue({}) },
          cashMovement: { create: mockCashMovementCreate },
        });
      });

      await salesService.voidSale('sale-open-shift', {
        adminPin: '1234',
        reason: 'Cliente canceló antes de salir',
      });

      // No se debe llamar a cashMovement.create en turno abierto para no duplicar la resta en arqueo
      expect(mockCashMovementCreate).not.toHaveBeenCalled();
    });

    it('al anular una venta de un turno CERRADO, sí debe registrar automáticamente un CashMovement EXPENSE en el turno abierto', async () => {
      mockPrisma.user = {
        findMany: vi.fn().mockResolvedValue([
          { id: 'admin-1', role: 'ADMIN', isActive: true, pin: '1234' },
        ]),
      };

      mockPrisma.sale = {
        findUnique: vi.fn().mockResolvedValue({
          id: 'sale-closed-shift',
          receiptType: ReceiptType.NOTA_VENTA,
          saleNumber: 'NV01-00000005',
          isVoided: false,
          createdAt: new Date(),
          paymentMethod: PaymentMethod.CASH,
          cashPaid: 70,
          changeAmount: 0,
          totalAmount: 70,
          cashShiftId: 'shift-closed-prev',
          cashShift: {
            id: 'shift-closed-prev',
            status: ShiftStatus.CLOSED, // Turno pasado CERRADO
            cashRegisterId: 'reg-1',
            cashRegister: { identifier: 'POS-01', name: 'Caja 1' },
          },
          items: [],
        }),
      };

      const mockCashMovementCreate = vi.fn().mockResolvedValue({ id: 'mov-refund-1' });
      mockPrisma.$transaction = vi.fn().mockImplementation(async (cb) => {
        return cb({
          sale: { update: vi.fn().mockResolvedValue({ id: 'sale-closed-shift', isVoided: true }) },
          cashShift: {
            update: vi.fn().mockResolvedValue({}),
            findFirst: vi.fn().mockResolvedValue({ id: 'current-open-shift' }),
          },
          kardexMovement: { create: vi.fn().mockResolvedValue({}) },
          product: { update: vi.fn().mockResolvedValue({}) },
          cashMovement: { create: mockCashMovementCreate },
        });
      });

      await salesService.voidSale('sale-closed-shift', {
        adminPin: '1234',
        reason: 'Devolución de venta de turno anterior',
      });

      // Sí debe crear el movimiento de egreso en el turno activo para compensar el dinero que sale de gaveta
      expect(mockCashMovementCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cashShiftId: 'current-open-shift',
            type: CashMovementType.EXPENSE,
            reason: expect.stringContaining('Turno anterior'),
          }),
        }),
      );
    });
  });
});

