import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReportsService } from './reports.service.js';
import { ReceiptType, CashMovementType } from '@prisma/client';

describe('ReportsService - Doble Segmentación (Tributario vs Gerencial)', () => {
  let reportsService: ReportsService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      sale: {
        findMany: vi.fn(),
      },
      cashMovement: {
        findMany: vi.fn(),
      },
    };
    reportsService = new ReportsService(mockPrisma);
  });

  describe('Libro Tributario (Para el Contador)', () => {
    it('debe filtrar ÚNICAMENTE Boletas y Facturas, excluyendo Notas de Venta', async () => {
      mockPrisma.sale.findMany.mockResolvedValue([
        {
          id: 'sale-1',
          createdAt: new Date('2026-10-12T10:00:00Z'),
          saleNumber: 1,
          receiptType: ReceiptType.BOLETA,
          series: 'B001',
          correlativeNumber: 1,
          fullReceiptNumber: 'B001-00000001',
          taxableBase: 84.75,
          igvAmount: 15.25,
          totalAmount: 100.0,
          customerDocument: '71234567',
          customerName: 'JUAN PEREZ',
          customerAddress: null,
          emissionStatus: 'SIMULATED',
          cashShift: { cashRegister: { name: 'Caja 1' } },
        },
        {
          id: 'sale-2',
          createdAt: new Date('2026-10-12T11:00:00Z'),
          saleNumber: 2,
          receiptType: ReceiptType.FACTURA,
          series: 'F001',
          correlativeNumber: 1,
          fullReceiptNumber: 'F001-00000001',
          taxableBase: 169.49,
          igvAmount: 30.51,
          totalAmount: 200.0,
          customerDocument: '20601234567',
          customerName: 'DISTRIBUIDORA SAC',
          customerAddress: 'Av. Industrial 100',
          emissionStatus: 'SIMULATED',
          cashShift: { cashRegister: { name: 'Caja 1' } },
        },
      ]);

      const result = await reportsService.getTaxBookData({
        startDate: '2026-10-12',
        endDate: '2026-10-12',
      });

      // Validar que se llamó con filtro exclusivo para Boleta y Factura
      expect(mockPrisma.sale.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isVoided: false,
            receiptType: { in: [ReceiptType.BOLETA, ReceiptType.FACTURA] },
          }),
        }),
      );

      expect(result.records).toHaveLength(2);
      expect(result.summary.receiptCount).toBe(1);
      expect(result.summary.invoiceCount).toBe(1);
      expect(result.records[0].sunatDocTypeCode).toBe('03'); // Boleta
      expect(result.records[1].sunatDocTypeCode).toBe('01'); // Factura
      expect(result.records[0].customerDocType).toBe('1'); // DNI
      expect(result.records[1].customerDocType).toBe('6'); // RUC
      expect(result.summary.totalAmount).toBe(300.0);
    });

    it('debe generar el buffer Excel del Libro Tributario con ExcelJS', async () => {
      mockPrisma.sale.findMany.mockResolvedValue([
        {
          id: 'sale-1',
          createdAt: new Date('2026-10-12T10:00:00Z'),
          saleNumber: 1,
          receiptType: ReceiptType.BOLETA,
          series: 'B001',
          correlativeNumber: 1,
          fullReceiptNumber: 'B001-00000001',
          taxableBase: 84.75,
          igvAmount: 15.25,
          totalAmount: 100.0,
          customerDocument: '71234567',
          customerName: 'JUAN PEREZ',
          emissionStatus: 'SIMULATED',
          cashShift: { cashRegister: { name: 'Caja 1' } },
        },
      ]);

      const buffer = await reportsService.generateTaxBookExcel({});
      expect(buffer).toBeDefined();
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(1000);
    });
  });

  describe('Reporte Operativo y Gerencial (Para la Dueña)', () => {
    it('debe consolidar el 100% de ingresos (Notas + Boletas + Facturas) y calcular ganancia neta y cuadre de gaveta', async () => {
      mockPrisma.sale.findMany.mockResolvedValue([
        {
          id: 'sale-1',
          saleNumber: 1,
          createdAt: new Date('2026-10-12T09:00:00Z'),
          receiptType: ReceiptType.NOTA_VENTA,
          series: 'NV01',
          correlativeNumber: 1,
          fullReceiptNumber: 'NV01-00000001',
          totalAmount: 50.0,
          cashPaid: 50.0,
          digitalPaid: 0,
          paymentMethod: 'CASH',
          customerName: 'Cliente Varios',
          user: { name: 'Cajero 1' },
          cashShift: { cashRegister: { name: 'Caja 1' } },
          items: [
            {
              id: 'item-1',
              productId: 'p1',
              quantity: 2,
              unitPrice: 25.0,
              subtotal: 50.0,
              costPriceSnapshot: 15.0, // Costo total = 30, Ganancia = 20
              product: { name: 'Arroz Extra', barcode: '775001' },
            },
          ],
        },
        {
          id: 'sale-2',
          saleNumber: 2,
          createdAt: new Date('2026-10-12T10:00:00Z'),
          receiptType: ReceiptType.BOLETA,
          series: 'B001',
          correlativeNumber: 1,
          fullReceiptNumber: 'B001-00000001',
          totalAmount: 100.0,
          cashPaid: 100.0,
          digitalPaid: 0,
          paymentMethod: 'CASH',
          customerName: 'Maria Lopez',
          user: { name: 'Cajero 1' },
          cashShift: { cashRegister: { name: 'Caja 1' } },
          items: [
            {
              id: 'item-2',
              productId: 'p2',
              quantity: 1,
              unitPrice: 100.0,
              subtotal: 100.0,
              costPriceSnapshot: 70.0, // Costo total = 70, Ganancia = 30
              product: { name: 'Aceite Primor', barcode: '775002' },
            },
          ],
        },
      ]);

      mockPrisma.cashMovement.findMany.mockResolvedValue([
        {
          id: 'mov-1',
          type: CashMovementType.EXPENSE,
          amount: 15.0,
          reason: 'Compra de bolsas plásticas',
          createdAt: new Date('2026-10-12T11:00:00Z'),
          cashShift: {
            cashRegister: { name: 'Caja 1' },
            user: { name: 'Cajero 1' },
          },
        },
        {
          id: 'mov-2',
          type: CashMovementType.INCOME,
          amount: 20.0,
          reason: 'Aporte para cambio de sencillo',
          createdAt: new Date('2026-10-12T08:30:00Z'),
          cashShift: {
            cashRegister: { name: 'Caja 1' },
            user: { name: 'Cajero 1' },
          },
        },
      ]);

      const result = await reportsService.getManagementReportData({});

      // 1. Ingresos Totales (100% de ventas) = 50 + 100 = 150
      expect(result.summary.totalGrossRevenue).toBe(150.0);

      // 2. Costo de mercadería = 30 + 70 = 100
      expect(result.summary.totalCogs).toBe(100.0);

      // 3. Ganancia Bruta Real = 150 - 100 = 50
      expect(result.summary.grossProfit).toBe(50.0);

      // 4. Salidas de caja chica = 15
      expect(result.summary.totalExpenses).toBe(15.0);

      // 5. Ganancia Neta Real = 50 - 15 = 35
      expect(result.summary.netProfit).toBe(35.0);

      // 6. Cuadre total de dinero en gaveta física:
      // Efectivo en ventas (150) + Entradas (20) - Salidas (15) = 155
      expect(result.summary.theoreticalDrawerCash).toBe(155.0);
    });

    it('debe generar el buffer Excel Gerencial de 3 hojas con ExcelJS', async () => {
      mockPrisma.sale.findMany.mockResolvedValue([]);
      mockPrisma.cashMovement.findMany.mockResolvedValue([]);

      const buffer = await reportsService.generateManagementExcel({});
      expect(buffer).toBeDefined();
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(1000);
    });
  });
});
