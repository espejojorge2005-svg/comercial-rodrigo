import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReceiptType, CashMovementType, Prisma } from '@prisma/client';
import { ReportQueryDto } from './dto/report-query.dto.js';
import ExcelJS from 'exceljs';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Construye los filtros de fecha asegurando zona horaria de Perú (UTC-5)
   */
  private buildDateFilter(startDate?: string, endDate?: string): Prisma.DateTimeFilter | undefined {
    if (!startDate && !endDate) return undefined;

    const filter: Prisma.DateTimeFilter = {};

    if (startDate) {
      const s = startDate.trim();
      const start = s.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(s)
        ? new Date(s)
        : s.includes('T')
          ? new Date(`${s}-05:00`)
          : new Date(`${s}T00:00:00.000-05:00`);
      if (!isNaN(start.getTime())) filter.gte = start;
    }

    if (endDate) {
      const e = endDate.trim();
      const end = e.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(e)
        ? new Date(e)
        : e.includes('T')
          ? new Date(`${e}-05:00`)
          : new Date(`${e}T23:59:59.999-05:00`);
      if (!isNaN(end.getTime())) filter.lte = end;
    }

    return filter.gte || filter.lte ? filter : undefined;
  }

  // =========================================================================
  // 1. REPORTE TRIBUTARIO / LIBRO DE VENTAS (PARA EL CONTADOR)
  // =========================================================================

  /**
   * Obtiene los datos oficiales del Registro de Ventas para el Contador.
   * Filtra ÚNICAMENTE Boletas y Facturas. Excluye 100% las Notas de Venta internas.
   */
  async getTaxBookData(query: ReportQueryDto) {
    const dateFilter = this.buildDateFilter(query.startDate, query.endDate);

    const where: Prisma.SaleWhereInput = {
      isVoided: false,
      receiptType: { in: [ReceiptType.BOLETA, ReceiptType.FACTURA] },
    };

    if (dateFilter) where.createdAt = dateFilter;
    if (query.shiftId) where.cashShiftId = query.shiftId;
    if (query.cashRegisterId) {
      where.cashShift = { cashRegisterId: query.cashRegisterId };
    }

    const sales = await this.prisma.sale.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { saleNumber: 'asc' }],
      include: {
        user: { select: { name: true } },
        cashShift: { include: { cashRegister: true } },
      },
    });

    let totalTaxableBase = 0;
    let totalIgv = 0;
    let totalAmount = 0;
    let invoiceCount = 0;
    let receiptCount = 0;

    const records = sales.map((sale, index) => {
      const taxable = Number(sale.taxableBase || 0);
      const igv = Number(sale.igvAmount || 0);
      const total = Number(sale.totalAmount || 0);

      totalTaxableBase += taxable;
      totalIgv += igv;
      totalAmount += total;

      const isInvoice = sale.receiptType === ReceiptType.FACTURA;
      if (isInvoice) invoiceCount++;
      else receiptCount++;

      // Código de tipo de comprobante SUNAT: 01 = Factura, 03 = Boleta de Venta
      const sunatDocTypeCode = isInvoice ? '01' : '03';

      // Tipo de documento de identidad del cliente:
      // 6: RUC, 1: DNI, 0: Sin documento / Otros
      let customerDocType = '0';
      const doc = sale.customerDocument?.trim();
      if (doc) {
        if (doc.length === 11) customerDocType = '6';
        else if (doc.length === 8) customerDocType = '1';
        else customerDocType = '0';
      }

      return {
        itemNumber: index + 1,
        id: sale.id,
        createdAt: sale.createdAt.toISOString(),
        issueDate: sale.createdAt.toLocaleDateString('es-PE', {
          timeZone: 'America/Lima',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }),
        receiptType: sale.receiptType,
        sunatDocTypeCode,
        receiptTypeName: isInvoice ? 'FACTURA ELECTRÓNICA' : 'BOLETA DE VENTA ELECTRÓNICA',
        series: sale.series,
        correlativeNumber: sale.correlativeNumber,
        formattedCorrelative: String(sale.correlativeNumber).padStart(8, '0'),
        fullReceiptNumber: sale.fullReceiptNumber || `${sale.series}-${String(sale.correlativeNumber).padStart(8, '0')}`,
        customerDocType,
        customerDocument: sale.customerDocument || '-',
        customerName: sale.customerName || (isInvoice ? 'EMPRESA' : 'CLIENTES VARIOS'),
        customerAddress: sale.customerAddress || '-',
        taxableBase: Number(taxable.toFixed(2)),
        igvAmount: Number(igv.toFixed(2)),
        totalAmount: Number(total.toFixed(2)),
        emissionStatus: sale.emissionStatus || 'ACEPTADO',
        cashRegister: sale.cashShift?.cashRegister?.name || 'Caja 1',
      };
    });

    return {
      period: {
        startDate: query.startDate || null,
        endDate: query.endDate || null,
      },
      summary: {
        totalFiscalSales: records.length,
        invoiceCount,
        receiptCount,
        totalTaxableBase: Number(totalTaxableBase.toFixed(2)),
        totalIgv: Number(totalIgv.toFixed(2)),
        totalAmount: Number(totalAmount.toFixed(2)),
      },
      records,
    };
  }

  /**
   * Genera el libro tributario oficial de ventas en formato Excel con ExcelJS
   */
  async generateTaxBookExcel(query: ReportQueryDto): Promise<Buffer> {
    const data = await this.getTaxBookData(query);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Comercial Rodrigo - Sistema POS';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Registro de Ventas e Ingresos', {
      views: [{ showGridLines: true }],
      pageSetup: { orientation: 'landscape', paperSize: 9 },
    });

    // Paleta de colores corporativa contable
    const colors = {
      headerBg: '1E3A8A', // Azul marino corporativo
      headerText: 'FFFFFF',
      subHeaderBg: 'DBEAFE', // Azul suave
      totalsBg: 'F1F5F9', // Gris pizarra claro
      border: 'CBD5E1', // Borde fino
      zebra: 'F8FAFC',
    };

    // 1. TÍTULO Y ENCABEZADO FISCAL
    sheet.mergeCells('A1:L1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'COMERCIAL RODRIGO - REGISTRO DE VENTAS E INGRESOS (SUNAT)';
    titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: colors.headerText } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.headerBg } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 34;

    // Subtítulo con metadatos tributarios
    sheet.mergeCells('A2:L2');
    const subTitleCell = sheet.getCell('A2');
    subTitleCell.value = `DOCUMENTO FISCAL CONTABLE OFICIAL | FILTRO: SOLO BOLETAS Y FACTURAS (EXCLUYE NOTAS DE VENTA INTERNAS) | RUC: 20600000000 | FECHA DE GENERACIÓN: ${new Date().toLocaleDateString('es-PE', { timeZone: 'America/Lima' })}`;
    subTitleCell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: '1E293B' } };
    subTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.subHeaderBg } };
    subTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(2).height = 20;

    sheet.addRow([]); // Espacio

    // 2. RESUMEN RÁPIDO EN CABECERA (KPIs para el Contador)
    const kpiRowIndex = 4;
    sheet.getCell(`B${kpiRowIndex}`).value = 'Total Boletas:';
    sheet.getCell(`B${kpiRowIndex}`).font = { bold: true };
    sheet.getCell(`C${kpiRowIndex}`).value = data.summary.receiptCount;

    sheet.getCell(`E${kpiRowIndex}`).value = 'Total Facturas:';
    sheet.getCell(`E${kpiRowIndex}`).font = { bold: true };
    sheet.getCell(`F${kpiRowIndex}`).value = data.summary.invoiceCount;

    sheet.getCell(`H${kpiRowIndex}`).value = 'Op. Gravada:';
    sheet.getCell(`H${kpiRowIndex}`).font = { bold: true };
    sheet.getCell(`I${kpiRowIndex}`).value = data.summary.totalTaxableBase;
    sheet.getCell(`I${kpiRowIndex}`).numFmt = '"S/ "#,##0.00';

    sheet.getCell(`J${kpiRowIndex}`).value = 'Total IGV (18%):';
    sheet.getCell(`J${kpiRowIndex}`).font = { bold: true };
    sheet.getCell(`K${kpiRowIndex}`).value = data.summary.totalIgv;
    sheet.getCell(`K${kpiRowIndex}`).numFmt = '"S/ "#,##0.00';

    sheet.addRow([]); // Espacio

    // 3. CABECERA DE LA TABLA
    const tableHeaderRowIndex = 6;
    const headers = [
      'N°',
      'FECHA EMISIÓN',
      'TIPO COMP.',
      'SERIE',
      'CORRELATIVO',
      'TIPO DOC.',
      'N° DOCUMENTO',
      'RAZÓN SOCIAL / CLIENTE',
      'BASE IMPONIBLE (S/)',
      'IGV 18% (S/)',
      'IMPORTE TOTAL (S/)',
      'ESTADO SUNAT',
    ];

    const headerRow = sheet.getRow(tableHeaderRowIndex);
    headerRow.values = headers;
    headerRow.height = 26;
    headerRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: colors.headerText } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.headerBg } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: colors.border } },
        bottom: { style: 'thin', color: { argb: colors.border } },
        left: { style: 'thin', color: { argb: colors.border } },
        right: { style: 'thin', color: { argb: colors.border } },
      };
    });

    // 4. FILAS DE DATOS
    let currentRow = tableHeaderRowIndex + 1;
    data.records.forEach((record, idx) => {
      const row = sheet.getRow(currentRow);
      row.values = [
        record.itemNumber,
        record.issueDate,
        record.sunatDocTypeCode, // 01 / 03
        record.series,
        record.formattedCorrelative,
        record.customerDocType, // 1 / 6 / 0
        record.customerDocument,
        record.customerName,
        record.taxableBase,
        record.igvAmount,
        record.totalAmount,
        record.emissionStatus,
      ];
      row.height = 20;

      const isZebra = idx % 2 === 1;

      row.eachCell((cell, colNumber) => {
        cell.font = { name: 'Calibri', size: 10 };
        cell.border = {
          top: { style: 'thin', color: { argb: colors.border } },
          bottom: { style: 'thin', color: { argb: colors.border } },
          left: { style: 'thin', color: { argb: colors.border } },
          right: { style: 'thin', color: { argb: colors.border } },
        };

        if (isZebra) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.zebra } };
        }

        // Alineaciones y formatos numéricos
        if ([1, 2, 3, 4, 5, 6, 12].includes(colNumber)) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (colNumber === 7) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (colNumber === 8) {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        } else if ([9, 10, 11].includes(colNumber)) {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.numFmt = '#,##0.00';
        }
      });

      currentRow++;
    });

    // 5. FILA DE TOTALES GENERALES (FÓRMULAS DE EXCEL)
    const totalsRow = sheet.getRow(currentRow);
    totalsRow.height = 24;
    totalsRow.getCell(1).value = '';
    sheet.mergeCells(`A${currentRow}:H${currentRow}`);
    const totalsLabel = sheet.getCell(`A${currentRow}`);
    totalsLabel.value = 'TOTALES GENERALES:';
    totalsLabel.font = { name: 'Calibri', size: 11, bold: true, color: { argb: '0F172A' } };
    totalsLabel.alignment = { horizontal: 'right', vertical: 'middle' };

    const startDataRow = tableHeaderRowIndex + 1;
    const endDataRow = currentRow - 1;

    // Fórmulas SUM
    if (data.records.length > 0) {
      totalsRow.getCell(9).value = { formula: `SUM(I${startDataRow}:I${endDataRow})`, result: data.summary.totalTaxableBase };
      totalsRow.getCell(10).value = { formula: `SUM(J${startDataRow}:J${endDataRow})`, result: data.summary.totalIgv };
      totalsRow.getCell(11).value = { formula: `SUM(K${startDataRow}:K${endDataRow})`, result: data.summary.totalAmount };
    } else {
      totalsRow.getCell(9).value = 0;
      totalsRow.getCell(10).value = 0;
      totalsRow.getCell(11).value = 0;
    }

    totalsRow.getCell(12).value = '';

    for (let c = 1; c <= 12; c++) {
      const cell = totalsRow.getCell(c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.totalsBg } };
      cell.font = { name: 'Calibri', size: 11, bold: true };
      cell.border = {
        top: { style: 'thin', color: { argb: '475569' } },
        bottom: { style: 'double', color: { argb: '475569' } }, // Doble línea contable inferior
        left: { style: 'thin', color: { argb: colors.border } },
        right: { style: 'thin', color: { argb: colors.border } },
      };
      if ([9, 10, 11].includes(c)) {
        cell.numFmt = '#,##0.00';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      }
    }

    // 6. ANCHOS DE COLUMNAS AJUSTADOS
    sheet.columns = [
      { key: 'item', width: 6 },
      { key: 'date', width: 14 },
      { key: 'type', width: 12 },
      { key: 'series', width: 10 },
      { key: 'correlative', width: 15 },
      { key: 'docType', width: 11 },
      { key: 'docNum', width: 16 },
      { key: 'customer', width: 34 },
      { key: 'base', width: 18 },
      { key: 'igv', width: 16 },
      { key: 'total', width: 18 },
      { key: 'status', width: 16 },
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  // =========================================================================
  // 2. REPORTE OPERATIVO Y GERENCIAL (PARA LA DUEÑA)
  // =========================================================================

  /**
   * Consolida el 100% de los ingresos (Notas de Venta + Boletas + Facturas),
   * costo de mercadería vendida, gastos de caja chica y cuadre total en gaveta física.
   */
  async getManagementReportData(query: ReportQueryDto) {
    const dateFilter = this.buildDateFilter(query.startDate, query.endDate);

    const saleWhere: Prisma.SaleWhereInput = {
      isVoided: false,
    };

    const movementWhere: Prisma.CashMovementWhereInput = {};

    if (dateFilter) {
      saleWhere.createdAt = dateFilter;
      movementWhere.createdAt = dateFilter;
    }

    if (query.shiftId) {
      saleWhere.cashShiftId = query.shiftId;
      movementWhere.cashShiftId = query.shiftId;
    }

    if (query.cashRegisterId) {
      saleWhere.cashShift = { cashRegisterId: query.cashRegisterId };
      movementWhere.cashShift = { cashRegisterId: query.cashRegisterId };
    }

    const [sales, cashMovements] = await Promise.all([
      this.prisma.sale.findMany({
        where: saleWhere,
        orderBy: [{ createdAt: 'asc' }, { saleNumber: 'asc' }],
        include: {
          items: {
            include: {
              product: {
                select: { id: true, name: true, barcode: true, unitType: true, costPrice: true },
              },
            },
          },
          user: { select: { id: true, name: true, username: true } },
          cashShift: { include: { cashRegister: true } },
        },
      }),
      this.prisma.cashMovement.findMany({
        where: movementWhere,
        orderBy: { createdAt: 'asc' },
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

    // Métricas globales
    let totalGrossRevenue = 0;
    let totalCogs = 0; // Cost of Goods Sold (Costo de mercadería)
    let totalUnitsSold = 0;
    let cashPaidTotal = 0;
    let digitalPaidTotal = 0;

    // Métricas por tipo de comprobante
    const receiptTypeSummary: Record<string, { count: number; total: number; profit: number }> = {
      NOTA_VENTA: { count: 0, total: 0, profit: 0 },
      BOLETA: { count: 0, total: 0, profit: 0 },
      FACTURA: { count: 0, total: 0, profit: 0 },
      NOTA_CREDITO_BOLETA: { count: 0, total: 0, profit: 0 },
      NOTA_CREDITO_FACTURA: { count: 0, total: 0, profit: 0 },
    };

    // Métodos de pago
    const paymentMethods = {
      CASH: 0,
      CARD: 0,
      TRANSFER: 0,
      MIXED: 0,
    };

    const salesDetail = sales.map((sale) => {
      const saleAmount = Number(sale.totalAmount);
      const cashPortion = Number(sale.cashPaid);
      const digitalPortion = Number(sale.digitalPaid);

      totalGrossRevenue += saleAmount;
      cashPaidTotal += cashPortion;
      digitalPaidTotal += digitalPortion;

      if (paymentMethods[sale.paymentMethod] !== undefined) {
        paymentMethods[sale.paymentMethod] += saleAmount;
      }

      let saleCost = 0;
      let saleUnits = 0;

      const itemsDetail = sale.items.map((item) => {
        const qty = Number(item.quantity);
        const unitPrice = Number(item.unitPrice);
        const subtotal = Number(item.subtotal);
        const unitCost = Number(item.costPriceSnapshot);
        const itemCost = Number((qty * unitCost).toFixed(2));
        const itemProfit = Number((subtotal - itemCost).toFixed(2));

        saleCost += itemCost;
        saleUnits += qty;
        totalUnitsSold += qty;

        return {
          id: item.id,
          productId: item.productId,
          productName: item.product.name,
          barcode: item.product.barcode,
          quantity: qty,
          unitPrice,
          costPrice: unitCost,
          subtotal,
          itemCost,
          profit: itemProfit,
        };
      });

      saleCost = Number(saleCost.toFixed(2));
      const saleProfit = Number((saleAmount - saleCost).toFixed(2));
      const marginPct = saleAmount > 0 ? Number(((saleProfit / saleAmount) * 100).toFixed(2)) : 0;

      totalCogs += saleCost;

      // Agrupar por comprobante
      const rType = sale.receiptType;
      if (receiptTypeSummary[rType]) {
        receiptTypeSummary[rType].count++;
        receiptTypeSummary[rType].total += saleAmount;
        receiptTypeSummary[rType].profit += saleProfit;
      }

      return {
        id: sale.id,
        saleNumber: sale.saleNumber,
        createdAt: sale.createdAt.toISOString(),
        receiptType: sale.receiptType,
        series: sale.series,
        correlativeNumber: sale.correlativeNumber,
        fullReceiptNumber: sale.fullReceiptNumber || `${sale.series}-${String(sale.correlativeNumber).padStart(8, '0')}`,
        customerName: sale.customerName || 'Cliente Varios',
        customerDocument: sale.customerDocument || '-',
        paymentMethod: sale.paymentMethod,
        cashPaid: cashPortion,
        digitalPaid: digitalPortion,
        totalAmount: saleAmount,
        totalCost: saleCost,
        profit: saleProfit,
        marginPct,
        unitsCount: saleUnits,
        cashier: sale.user.name,
        cashRegister: sale.cashShift.cashRegister.name,
        items: itemsDetail,
      };
    });

    totalGrossRevenue = Number(totalGrossRevenue.toFixed(2));
    totalCogs = Number(totalCogs.toFixed(2));
    const grossProfit = Number((totalGrossRevenue - totalCogs).toFixed(2));
    const grossMarginPct = totalGrossRevenue > 0 ? Number(((grossProfit / totalGrossRevenue) * 100).toFixed(2)) : 0;

    // Movimientos de caja chica
    let totalExpenses = 0;
    let totalIncomes = 0;

    const cashMovementsDetail = cashMovements.map((m) => {
      const amount = Number(m.amount);
      if (m.type === CashMovementType.EXPENSE) {
        totalExpenses += amount;
      } else {
        totalIncomes += amount;
      }

      return {
        id: m.id,
        type: m.type,
        amount,
        reason: m.reason,
        createdAt: m.createdAt.toISOString(),
        cashRegister: m.cashShift.cashRegister.name,
        cashier: m.cashShift.user.name,
      };
    });

    totalExpenses = Number(totalExpenses.toFixed(2));
    totalIncomes = Number(totalIncomes.toFixed(2));

    // Ganancia Neta Real (Utilidad Bruta - Gastos Operativos de Caja Chica)
    const netProfit = Number((grossProfit - totalExpenses).toFixed(2));
    const netMarginPct = totalGrossRevenue > 0 ? Number(((netProfit / totalGrossRevenue) * 100).toFixed(2)) : 0;

    // Cuadre total de dinero físico en gaveta:
    // Efectivo en ventas + Ingresos varios en caja chica - Salidas de dinero de caja chica
    const theoreticalDrawerCash = Number((cashPaidTotal + totalIncomes - totalExpenses).toFixed(2));

    return {
      period: {
        startDate: query.startDate || null,
        endDate: query.endDate || null,
      },
      summary: {
        totalGrossRevenue, // 100% de ingresos consolidados
        totalCogs, // Costo de mercadería
        grossProfit, // Ganancia Bruta Real
        grossMarginPct, // Margen Bruto %
        totalExpenses, // Salidas de caja chica
        totalIncomes, // Ingresos varios caja chica
        netProfit, // Ganancia Neta Real
        netMarginPct, // Margen Neto %
        salesCount: sales.length,
        totalUnitsSold,
        cashPaidTotal: Number(cashPaidTotal.toFixed(2)),
        digitalPaidTotal: Number(digitalPaidTotal.toFixed(2)),
        theoreticalDrawerCash, // Cuadre total de gaveta física
        paymentMethods,
        receiptTypeSummary: {
          notaVenta: {
            count: receiptTypeSummary.NOTA_VENTA.count,
            total: Number(receiptTypeSummary.NOTA_VENTA.total.toFixed(2)),
            profit: Number(receiptTypeSummary.NOTA_VENTA.profit.toFixed(2)),
            sharePct: totalGrossRevenue > 0 ? Number(((receiptTypeSummary.NOTA_VENTA.total / totalGrossRevenue) * 100).toFixed(2)) : 0,
          },
          boleta: {
            count: receiptTypeSummary.BOLETA.count,
            total: Number(receiptTypeSummary.BOLETA.total.toFixed(2)),
            profit: Number(receiptTypeSummary.BOLETA.profit.toFixed(2)),
            sharePct: totalGrossRevenue > 0 ? Number(((receiptTypeSummary.BOLETA.total / totalGrossRevenue) * 100).toFixed(2)) : 0,
          },
          factura: {
            count: receiptTypeSummary.FACTURA.count,
            total: Number(receiptTypeSummary.FACTURA.total.toFixed(2)),
            profit: Number(receiptTypeSummary.FACTURA.profit.toFixed(2)),
            sharePct: totalGrossRevenue > 0 ? Number(((receiptTypeSummary.FACTURA.total / totalGrossRevenue) * 100).toFixed(2)) : 0,
          },
        },
      },
      salesDetail,
      cashMovementsDetail,
    };
  }

  /**
   * Genera el Reporte Operativo y Gerencial en Excel (3 Hojas con KPIs, Detalle y Gastos)
   */
  async generateManagementExcel(query: ReportQueryDto): Promise<Buffer> {
    const data = await this.getManagementReportData(query);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Comercial Rodrigo - Sistema POS';
    workbook.created = new Date();

    const colors = {
      headerBg: '0F172A', // Slate oscuro elegante
      headerText: 'FFFFFF',
      kpiGreenBg: 'DCFCE7', // Verde claro
      kpiGreenText: '166534',
      kpiBlueBg: 'DBEAFE',
      kpiBlueText: '1E40AF',
      kpiRedBg: 'FEE2E2',
      kpiRedText: '991B1B',
      zebra: 'F8FAFC',
      border: 'E2E8F0',
      totalsBg: 'E2E8F0',
    };

    // =========================================================================
    // HOJA 1: RESUMEN EJECUTIVO Y CUADRE DE GAVETA
    // =========================================================================
    const sheet1 = workbook.addWorksheet('Resumen Ejecutivo y Cuadre', {
      views: [{ showGridLines: true }],
    });

    sheet1.mergeCells('A1:G1');
    const titleCell = sheet1.getCell('A1');
    titleCell.value = 'COMERCIAL RODRIGO - REPORTE OPERATIVO Y GERENCIAL';
    titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.headerBg } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet1.getRow(1).height = 36;

    sheet1.mergeCells('A2:G2');
    const subCell = sheet1.getCell('A2');
    subCell.value = `CONSOLIDACIÓN 100% INGRESOS (NOTAS + BOLETAS + FACTURAS) | RENTABILIDAD REAL | CUADRE DE GAVETA FÍSICA`;
    subCell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: '0284C7' } };
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F0F9FF' } };
    subCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet1.getRow(2).height = 20;

    sheet1.addRow([]);

    // TARJETAS KPIS PRINCIPALES (Fila 4 a 6)
    const renderKpiCard = (
      startCol: string,
      endCol: string,
      label: string,
      value: number | string,
      bgColor: string,
      textColor: string,
      isCurrency = true,
    ) => {
      sheet1.mergeCells(`${startCol}4:${endCol}4`);
      sheet1.mergeCells(`${startCol}5:${endCol}5`);

      const labelCell = sheet1.getCell(`${startCol}4`);
      labelCell.value = label;
      labelCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: textColor } };
      labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      labelCell.alignment = { horizontal: 'center', vertical: 'middle' };

      const valCell = sheet1.getCell(`${startCol}5`);
      valCell.value = value;
      valCell.font = { name: 'Calibri', size: 15, bold: true, color: { argb: textColor } };
      valCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      valCell.alignment = { horizontal: 'center', vertical: 'middle' };
      if (isCurrency && typeof value === 'number') {
        valCell.numFmt = '"S/ "#,##0.00';
      }
    };

    renderKpiCard('A', 'B', 'INGRESOS TOTALES (100%)', data.summary.totalGrossRevenue, colors.kpiBlueBg, colors.kpiBlueText);
    renderKpiCard('C', 'C', 'COSTO MERCADERÍA (COGS)', data.summary.totalCogs, 'FEF3C7', '92400E');
    renderKpiCard('D', 'D', 'GANANCIA BRUTA REAL', data.summary.grossProfit, colors.kpiGreenBg, colors.kpiGreenText);
    renderKpiCard('E', 'E', 'SALIDAS CAJA CHICA', data.summary.totalExpenses, colors.kpiRedBg, colors.kpiRedText);
    renderKpiCard('F', 'G', 'GANANCIA NETA OPERATIVA', data.summary.netProfit, 'DCFCE7', '14532D');

    sheet1.addRow([]);
    sheet1.addRow([]);

    // SECCIÓN A: CUADRE TOTAL DE DINERO EN GAVETA FÍSICA
    const cuadreRowStart = 8;
    sheet1.mergeCells(`A${cuadreRowStart}:D${cuadreRowStart}`);
    const cuadreHeader = sheet1.getCell(`A${cuadreRowStart}`);
    cuadreHeader.value = 'CUADRE TOTAL DE DINERO EN GAVETA FÍSICA (EFECTIVO)';
    cuadreHeader.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFF' } };
    cuadreHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '047857' } }; // Verde esmeralda
    cuadreHeader.alignment = { horizontal: 'left', vertical: 'middle' };
    sheet1.getRow(cuadreRowStart).height = 24;

    const cuadreRows = [
      ['(+) Efectivo Real Cobrado por Ventas', data.summary.cashPaidTotal],
      ['(+) Entradas adicionales a Caja Chica', data.summary.totalIncomes],
      ['(-) Salidas / Gastos de Caja Chica', -data.summary.totalExpenses],
      ['(=) EFECTIVO TOTAL ESPERADO EN GAVETA FÍSICA', data.summary.theoreticalDrawerCash],
    ];

    cuadreRows.forEach((item, i) => {
      const r = cuadreRowStart + 1 + i;
      sheet1.mergeCells(`A${r}:C${r}`);
      const lCell = sheet1.getCell(`A${r}`);
      lCell.value = item[0];
      lCell.font = { bold: i === 3, size: i === 3 ? 11 : 10 };
      lCell.alignment = { vertical: 'middle' };

      const vCell = sheet1.getCell(`D${r}`);
      vCell.value = item[1];
      vCell.font = { bold: i === 3, size: i === 3 ? 11 : 10, color: { argb: i === 3 ? '047857' : '000000' } };
      vCell.numFmt = '"S/ "#,##0.00';
      vCell.alignment = { horizontal: 'right', vertical: 'middle' };

      if (i === 3) {
        lCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D1FAE5' } };
        vCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D1FAE5' } };
      }
      sheet1.getRow(r).height = 20;
    });

    // SECCIÓN B: DESGLOSE POR TIPO DE COMPROBANTE
    const compRowStart = 14;
    sheet1.mergeCells(`A${compRowStart}:G${compRowStart}`);
    const compHeader = sheet1.getCell(`A${compRowStart}`);
    compHeader.value = 'DESGLOSE DE VENTAS POR TIPO DE COMPROBANTE';
    compHeader.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFF' } };
    compHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E3A8A' } };
    compHeader.alignment = { horizontal: 'left', vertical: 'middle' };
    sheet1.getRow(compRowStart).height = 24;

    const compHeaderRow = sheet1.getRow(compRowStart + 1);
    compHeaderRow.values = ['TIPO DE COMPROBANTE', 'CANTIDAD', 'VENTA TOTAL (S/)', '% PARTICIPACIÓN', 'COSTO MERCADERÍA', 'GANANCIA REAL', 'MARGEN %'];
    compHeaderRow.font = { bold: true, size: 10 };
    compHeaderRow.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    const compData = [
      [
        'Notas de Venta (Internas)',
        data.summary.receiptTypeSummary.notaVenta.count,
        data.summary.receiptTypeSummary.notaVenta.total,
        data.summary.receiptTypeSummary.notaVenta.sharePct / 100,
        data.summary.receiptTypeSummary.notaVenta.total - data.summary.receiptTypeSummary.notaVenta.profit,
        data.summary.receiptTypeSummary.notaVenta.profit,
        data.summary.receiptTypeSummary.notaVenta.total > 0
          ? data.summary.receiptTypeSummary.notaVenta.profit / data.summary.receiptTypeSummary.notaVenta.total
          : 0,
      ],
      [
        'Boletas Electrónicas',
        data.summary.receiptTypeSummary.boleta.count,
        data.summary.receiptTypeSummary.boleta.total,
        data.summary.receiptTypeSummary.boleta.sharePct / 100,
        data.summary.receiptTypeSummary.boleta.total - data.summary.receiptTypeSummary.boleta.profit,
        data.summary.receiptTypeSummary.boleta.profit,
        data.summary.receiptTypeSummary.boleta.total > 0
          ? data.summary.receiptTypeSummary.boleta.profit / data.summary.receiptTypeSummary.boleta.total
          : 0,
      ],
      [
        'Facturas Electrónicas',
        data.summary.receiptTypeSummary.factura.count,
        data.summary.receiptTypeSummary.factura.total,
        data.summary.receiptTypeSummary.factura.sharePct / 100,
        data.summary.receiptTypeSummary.factura.total - data.summary.receiptTypeSummary.factura.profit,
        data.summary.receiptTypeSummary.factura.profit,
        data.summary.receiptTypeSummary.factura.total > 0
          ? data.summary.receiptTypeSummary.factura.profit / data.summary.receiptTypeSummary.factura.total
          : 0,
      ],
    ];

    compData.forEach((rowVals, i) => {
      const r = compRowStart + 2 + i;
      const row = sheet1.getRow(r);
      row.values = rowVals;
      row.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
      row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(3).numFmt = '#,##0.00';
      row.getCell(4).numFmt = '0.00%';
      row.getCell(5).numFmt = '#,##0.00';
      row.getCell(6).numFmt = '#,##0.00';
      row.getCell(7).numFmt = '0.00%';
    });

    sheet1.columns = [
      { key: 'colA', width: 30 },
      { key: 'colB', width: 14 },
      { key: 'colC', width: 20 },
      { key: 'colD', width: 18 },
      { key: 'colE', width: 20 },
      { key: 'colF', width: 18 },
      { key: 'colG', width: 16 },
    ];

    // =========================================================================
    // HOJA 2: DETALLE DE TODAS LAS VENTAS (100% INGRESOS)
    // =========================================================================
    const sheet2 = workbook.addWorksheet('Detalle Todas las Ventas', {
      views: [{ showGridLines: true }],
    });

    sheet2.mergeCells('A1:L1');
    const sheet2Title = sheet2.getCell('A1');
    sheet2Title.value = 'DETALLE INDIVIDUAL DE TODAS LAS VENTAS (NOTAS + BOLETAS + FACTURAS)';
    sheet2Title.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFF' } };
    sheet2Title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E293B' } };
    sheet2Title.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet2.getRow(1).height = 30;

    const salesHeaders = [
      'N° VENTA',
      'FECHA / HORA',
      'TIPO COMP.',
      'N° COMPROBANTE',
      'CLIENTE',
      'MEDIO PAGO',
      'EFECTIVO (S/)',
      'DIGITAL (S/)',
      'TOTAL VENTA (S/)',
      'COSTO MERC. (S/)',
      'GANANCIA REAL (S/)',
      'MARGEN %',
    ];

    const sHeaderRow = sheet2.getRow(3);
    sHeaderRow.values = salesHeaders;
    sHeaderRow.height = 24;
    sHeaderRow.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '334155' } };
      c.font = { bold: true, color: { argb: 'FFFFFF' }, size: 10 };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    let sRowIdx = 4;
    data.salesDetail.forEach((s, idx) => {
      const row = sheet2.getRow(sRowIdx);
      const isZebra = idx % 2 === 1;

      row.values = [
        s.saleNumber,
        new Date(s.createdAt).toLocaleString('es-PE', { timeZone: 'America/Lima' }),
        s.receiptType,
        s.fullReceiptNumber,
        s.customerName,
        s.paymentMethod,
        s.cashPaid,
        s.digitalPaid,
        s.totalAmount,
        s.totalCost,
        s.profit,
        s.marginPct / 100,
      ];
      row.height = 19;

      row.eachCell((cell, colNum) => {
        cell.font = { size: 10 };
        cell.border = {
          top: { style: 'thin', color: { argb: colors.border } },
          bottom: { style: 'thin', color: { argb: colors.border } },
          left: { style: 'thin', color: { argb: colors.border } },
          right: { style: 'thin', color: { argb: colors.border } },
        };
        if (isZebra) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.zebra } };
        }

        if ([1, 2, 3, 4, 6].includes(colNum)) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (colNum === 5) {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        } else if ([7, 8, 9, 10, 11].includes(colNum)) {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.numFmt = '#,##0.00';
        } else if (colNum === 12) {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.numFmt = '0.00%';
        }
      });

      sRowIdx++;
    });

    // Totales de Hoja 2
    if (data.salesDetail.length > 0) {
      const sTotalsRow = sheet2.getRow(sRowIdx);
      sTotalsRow.height = 24;
      sheet2.mergeCells(`A${sRowIdx}:F${sRowIdx}`);
      const tLbl = sheet2.getCell(`A${sRowIdx}`);
      tLbl.value = 'TOTALES:';
      tLbl.font = { bold: true };
      tLbl.alignment = { horizontal: 'right', vertical: 'middle' };

      sTotalsRow.getCell(7).value = { formula: `SUM(G4:G${sRowIdx - 1})`, result: data.summary.cashPaidTotal };
      sTotalsRow.getCell(8).value = { formula: `SUM(H4:H${sRowIdx - 1})`, result: data.summary.digitalPaidTotal };
      sTotalsRow.getCell(9).value = { formula: `SUM(I4:I${sRowIdx - 1})`, result: data.summary.totalGrossRevenue };
      sTotalsRow.getCell(10).value = { formula: `SUM(J4:J${sRowIdx - 1})`, result: data.summary.totalCogs };
      sTotalsRow.getCell(11).value = { formula: `SUM(K4:K${sRowIdx - 1})`, result: data.summary.grossProfit };

      for (let c = 1; c <= 12; c++) {
        const cell = sTotalsRow.getCell(c);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.totalsBg } };
        cell.font = { bold: true };
        cell.border = { top: { style: 'thin' }, bottom: { style: 'double' } };
        if ([7, 8, 9, 10, 11].includes(c)) cell.numFmt = '#,##0.00';
      }
    }

    sheet2.columns = [
      { width: 10 },
      { width: 18 },
      { width: 14 },
      { width: 18 },
      { width: 28 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
      { width: 16 },
      { width: 16 },
      { width: 18 },
      { width: 12 },
    ];

    // =========================================================================
    // HOJA 3: MOVIMIENTOS Y GASTOS DE CAJA CHICA
    // =========================================================================
    const sheet3 = workbook.addWorksheet('Movimientos Caja Chica', {
      views: [{ showGridLines: true }],
    });

    sheet3.mergeCells('A1:F1');
    const sheet3Title = sheet3.getCell('A1');
    sheet3Title.value = 'SALIDAS Y ENTRADAS DE DINERO DE CAJA CHICA';
    sheet3Title.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFF' } };
    sheet3Title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '991B1B' } }; // Rojo formal
    sheet3Title.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet3.getRow(1).height = 30;

    const movHeaders = ['N°', 'FECHA / HORA', 'TIPO', 'MOTIVO / CONCEPTO', 'CAJERO / CAJA', 'MONTO (S/)'];
    const mHeaderRow = sheet3.getRow(3);
    mHeaderRow.values = movHeaders;
    mHeaderRow.height = 24;
    mHeaderRow.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '7F1D1D' } };
      c.font = { bold: true, color: { argb: 'FFFFFF' }, size: 10 };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    let mRowIdx = 4;
    data.cashMovementsDetail.forEach((m, idx) => {
      const row = sheet3.getRow(mRowIdx);
      const isExpense = m.type === CashMovementType.EXPENSE;
      row.values = [
        idx + 1,
        new Date(m.createdAt).toLocaleString('es-PE', { timeZone: 'America/Lima' }),
        isExpense ? 'SALIDA (GASTO)' : 'INGRESO',
        m.reason,
        `${m.cashier} (${m.cashRegister})`,
        isExpense ? -m.amount : m.amount,
      ];
      row.height = 20;

      row.eachCell((cell, colNum) => {
        cell.font = { size: 10 };
        cell.border = {
          top: { style: 'thin', color: { argb: colors.border } },
          bottom: { style: 'thin', color: { argb: colors.border } },
          left: { style: 'thin', color: { argb: colors.border } },
          right: { style: 'thin', color: { argb: colors.border } },
        };
        if (colNum === 6) {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.numFmt = '#,##0.00';
          cell.font = { bold: true, color: { argb: isExpense ? 'DC2626' : '16A34A' } };
        } else if ([1, 2, 3].includes(colNum)) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
      });
      mRowIdx++;
    });

    sheet3.columns = [
      { width: 6 },
      { width: 18 },
      { width: 16 },
      { width: 36 },
      { width: 24 },
      { width: 16 },
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
