import { describe, it, expect, beforeEach, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { ReportsService, buildPeruDateTimeFilter } from './reports.service.js';
import { ReceiptType, CashMovementType } from '@prisma/client';

describe('ReportsService - Doble Segmentación (Tributario vs Gerencial)', () => {
  let reportsService: ReportsService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      sale: {
        findMany: vi.fn(),
      },
      creditNote: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      cashMovement: {
        findMany: vi.fn(),
      },
      cashShift: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    reportsService = new ReportsService(mockPrisma);
  });

  describe('Libro Tributario (Para el Contador)', () => {
    it('debe filtrar ÚNICAMENTE Boletas y Facturas, excluyendo Notas de Venta e incluyendo Notas de Crédito restando', async () => {
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
          isVoided: false,
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
          isVoided: false,
          cashShift: { cashRegister: { name: 'Caja 1' } },
        },
      ]);

      mockPrisma.creditNote.findMany.mockResolvedValue([
        {
          id: 'nc-1',
          createdAt: new Date('2026-10-12T12:00:00Z'),
          series: 'BC01',
          correlativeNumber: 1,
          fullNumber: 'BC01-00000001',
          taxableBase: 84.75,
          igvAmount: 15.25,
          totalAmount: 100.0,
          reasonCode: '01',
          reasonDescription: 'ANULACIÓN DE LA OPERACIÓN',
          emissionStatus: 'SIMULATED',
          cashShift: { cashRegister: { name: 'Caja 1' } },
          sale: {
            receiptType: ReceiptType.BOLETA,
            series: 'B001',
            correlativeNumber: 1,
            fullReceiptNumber: 'B001-00000001',
            customerDocument: '71234567',
            customerName: 'JUAN PEREZ',
          },
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
            receiptType: { in: [ReceiptType.BOLETA, ReceiptType.FACTURA] },
          }),
        }),
      );

      // 2 ventas + 1 Nota de Crédito = 3 registros
      expect(result.records).toHaveLength(3);
      expect(result.summary.receiptCount).toBe(1);
      expect(result.summary.invoiceCount).toBe(1);
      expect(result.summary.creditNoteCount).toBe(1);
      expect(result.records[0].sunatDocTypeCode).toBe('03'); // Boleta
      expect(result.records[1].sunatDocTypeCode).toBe('01'); // Factura
      expect(result.records[2].sunatDocTypeCode).toBe('07'); // Nota de Crédito
      expect(result.records[2].taxableBase).toBe(-84.75); // Resta base
      expect(result.records[2].totalAmount).toBe(-100.0); // Resta total
      expect(result.records[2].modifiedDocument).toBe('03 - B001-00000001');

      // Total neto: 100 + 200 - 100 = 200
      expect(result.summary.totalAmount).toBe(200.0);

      // Pago a cuenta del Impuesto a la Renta (1% Régimen MYPE Tributario)
      // totalTaxableBase = 84.75 + 169.49 - 84.75 = 169.49 -> 1% = 1.69
      expect(result.summary.estimatedIncomeTax1Pct).toBe(1.69);
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

      // Validar estructura del Excel generado y las 4 tarjetas de resumen
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as any);
      const sheet = workbook.getWorksheet('Registro de Ventas e Ingresos');
      expect(sheet).toBeDefined();

      // Verificar títulos de las 4 tarjetas de resumen (Fila 4)
      expect(sheet?.getCell('A4').value).toBe('TOTAL OP. GRAVADA');
      expect(sheet?.getCell('D4').value).toBe('TOTAL I.G.V.');
      expect(sheet?.getCell('G4').value).toBe('TOTAL FACTURADO');
      expect(sheet?.getCell('J4').value).toBe('PAGO A CTA. RENTA 1% (RMT)');

      // Verificar valor de la tarjeta de Renta 1% (Fila 5) -> 84.75 * 0.01 = 0.85
      expect(sheet?.getCell('J5').value).toBe(0.85);

      // Verificar encabezados estándar de la tabla SUNAT (Fila 7)
      expect(sheet?.getCell('A7').value).toBe('N°');
      expect(sheet?.getCell('I7').value).toBe('BASE IMPONIBLE (S/)');
      expect(sheet?.getCell('J7').value).toBe('IGV 18% (S/)');
      expect(sheet?.getCell('K7').value).toBe('IMPORTE TOTAL (S/)');
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

      mockPrisma.cashShift.findMany.mockResolvedValue([
        {
          id: 'shift-1',
          initialBalance: 50.0,
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
      // Fondo inicial (50) + Efectivo en ventas (150) + Entradas (20) - Salidas (15) = 205
      expect(result.summary.totalInitialBalances).toBe(50.0);
      expect(result.summary.theoreticalDrawerCash).toBe(205.0);
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

  describe('Filtros por Fecha y Zona Horaria Perú (America/Lima, UTC-5)', () => {
    it('debe generar el rango exacto de 24 horas en hora peruana (UTC-5) para formato YYYY-MM-DD', () => {
      const filter = buildPeruDateTimeFilter('2026-10-24', '2026-10-24');

      expect(filter).toBeDefined();
      expect(filter?.gte).toBeInstanceOf(Date);
      expect(filter?.lte).toBeInstanceOf(Date);

      // Inicio: 2026-10-24 00:00:00.000 en Perú (-05:00) -> 2026-10-24T05:00:00.000Z en UTC
      expect((filter?.gte as Date)?.toISOString()).toBe('2026-10-24T05:00:00.000Z');

      // Fin: 2026-10-24 23:59:59.999 en Perú (-05:00) -> 2026-10-25T04:59:59.999Z en UTC
      expect((filter?.lte as Date)?.toISOString()).toBe('2026-10-25T04:59:59.999Z');
    });

    it('demuestra por qué la propuesta setUTCHours(23, 59, 59, 999) es errónea y excluye ventas nocturnas', () => {
      // Venta realizada a las 20:30 (8:30 PM) hora peruana del 24 de octubre
      // En UTC (Perú es UTC-5), esta venta se almacena como 25 de octubre a las 01:30:00 UTC
      const eveningSaleTimestamp = new Date('2026-10-25T01:30:00.000Z');

      // 1. Solución ingenua/errónea propuesta con setUTCHours:
      const flawedEnd = new Date('2026-10-24');
      flawedEnd.setUTCHours(23, 59, 59, 999); // 2026-10-24T23:59:59.999Z (18:59:59 hora peruana)

      // La venta de las 8:30 PM queda EXCLUIDA con setUTCHours (corte a las 6:59 PM Perú)
      expect(eveningSaleTimestamp.getTime() <= flawedEnd.getTime()).toBe(false);

      // 2. Solución oficial del sistema con buildPeruDateTimeFilter:
      const peruFilter = buildPeruDateTimeFilter('2026-10-24', '2026-10-24');
      expect(peruFilter?.lte).toBeDefined();

      // La venta de las 8:30 PM queda CORRECTAMENTE INCLUIDA en la jornada del 24 de octubre
      expect(eveningSaleTimestamp.getTime() <= (peruFilter!.lte as Date).getTime()).toBe(true);
      expect(eveningSaleTimestamp.getTime() >= (peruFilter!.gte as Date).getTime()).toBe(true);
    });

    it('debe extender fechas con medianoche T00:00:00 en endDate hasta fin de jornada en Perú', () => {
      const filter = buildPeruDateTimeFilter(
        '2026-10-24T00:00:00.000Z',
        '2026-10-24T00:00:00.000Z',
      );

      // El endDate con medianoche se extiende a 23:59:59.999 hora de Perú
      expect((filter?.lte as Date)?.toISOString()).toBe('2026-10-25T04:59:59.999Z');
    });

    it('debe generar archivo plano SIRE RVIE TXT oficial y excluir devoluciones de turnos cerrados de gastos operativos', async () => {
      mockPrisma.sale.findMany.mockResolvedValue([
        {
          id: 'sale-sire-1',
          createdAt: new Date('2026-10-12T15:00:00Z'),
          saleNumber: 10,
          receiptType: ReceiptType.FACTURA,
          series: 'F001',
          correlativeNumber: 25,
          fullReceiptNumber: 'F001-00000025',
          taxableBase: 100.0,
          igvAmount: 18.0,
          totalAmount: 118.0,
          customerDocument: '20552103816',
          customerName: 'CORPORACION PERU SAC',
          customerAddress: 'Av. Arequipa 1200',
          emissionStatus: 'SIMULATED',
          isVoided: false,
          cashShift: { cashRegister: { name: 'Caja 1' } },
        },
      ]);
      mockPrisma.creditNote.findMany.mockResolvedValue([]);

      const sire = await reportsService.generateSireRvieTxt({
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      });
      expect(sire.filename).toMatch(/^LE\d{11}20261000140400021112\.txt$/);
      expect(sire.content).toContain('|01|F001|00000025||6|20552103816|CORPORACION PERU SAC|');
      expect(sire.content).toContain('|100.00|0.00|18.00|0.00|');

      // Verificar que una devolución de venta anulada de turno anterior NO genera pérdida falsa en netProfit
      mockPrisma.sale.findMany.mockResolvedValue([]);
      mockPrisma.cashMovement.findMany.mockResolvedValue([
        {
          id: 'mov-void-refund',
          type: CashMovementType.EXPENSE,
          amount: 100.0,
          reason: 'Devolución en efectivo por anulación de B001-00000005 (Turno anterior)',
          createdAt: new Date('2026-10-12T16:00:00Z'),
          cashShift: {
            cashRegister: { name: 'Caja 1' },
            user: { name: 'Admin' },
          },
        },
      ]);
      mockPrisma.cashShift.findMany.mockResolvedValue([{ id: 's1', initialBalance: 200.0 }]);

      const mgmt = await reportsService.getManagementReportData({});
      expect(mgmt.summary.totalExpenses).toBe(100.0);
      expect(mgmt.summary.operatingExpenses).toBe(0);
      expect(mgmt.summary.netProfit).toBe(0);
      expect(mgmt.summary.theoreticalDrawerCash).toBe(100.0); // 200 inicial - 100 salida física = 100 en gaveta
    });

    it('getTaxBookData aplica el rango horario de Perú al filtrar ventas', async () => {
      mockPrisma.sale.findMany.mockResolvedValue([]);
      mockPrisma.creditNote.findMany.mockResolvedValue([]);

      await reportsService.getTaxBookData({
        startDate: '2026-10-24',
        endDate: '2026-10-24',
      });

      expect(mockPrisma.sale.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: {
              gte: new Date('2026-10-24T05:00:00.000Z'),
              lte: new Date('2026-10-25T04:59:59.999Z'),
            },
          }),
        }),
      );
    });
  });
});
