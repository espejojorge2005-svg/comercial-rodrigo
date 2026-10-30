import * as XLSX from 'xlsx';
import type { Product, KardexMovement } from '../types/index.js';
import { getUnitBadge, getUnitShortName } from './units.js';
import { formatPeruDateTime, getPeruYMD, getProductExpirationInfo } from './utils.js';

/**
 * Función auxiliar para formatear fecha y hora a hora peruana
 */
const formatDateTime = (dateStr?: string | Date | null): string => {
  return formatPeruDateTime(dateStr, false);
};

/**
 * Traduce el tipo de movimiento de Kardex
 */
const translateMovementType = (type: string): string => {
  switch (type) {
    case 'SALE':
      return 'VENTA POS';
    case 'RETURN_SALE':
      return 'DEV. / ANULACIÓN';
    case 'PURCHASE':
      return 'COMPRA / INGRESO';
    case 'ADJUSTMENT_IN':
      return 'AJUSTE ENTRADA (+)';
    case 'ADJUSTMENT_OUT':
      return 'AJUSTE SALIDA (-)';
    default:
      return type;
  }
};

/**
 * Traduce el método de pago al español
 */
const translatePaymentMethod = (method: string): string => {
  switch (method) {
    case 'CASH':
      return 'Efectivo';
    case 'TRANSFER':
      return 'Yape / Plin';
    case 'CARD':
      return 'Tarjeta';
    case 'MIXED':
      return 'Pago Mixto';
    default:
      return method || 'Efectivo';
  }
};

/**
 * Previene inyección de fórmulas DDE/CSV en celdas de texto exportadas a Excel
 */
export function sanitizeExcelCell(val: string | number): string | number {
  if (typeof val !== 'string') return val;
  const trimmed = val.trimStart();
  if (trimmed.length > 0 && /^[=+\-@]/.test(trimmed) && !/^-{2,}/.test(trimmed)) {
    return `'${val}`;
  }
  return val;
}

/**
 * Crea una hoja de cálculo con encabezado ejecutivo formal, tabla de datos y fila de totales
 */
function createFormattedSheet(options: {
  storeName: string;
  reportTitle: string;
  reportSubtitle: string;
  headers: string[];
  dataRows: (string | number)[][];
  totalsRow?: (string | number)[];
  columnWidths?: number[];
}): XLSX.WorkSheet {
  const { storeName, reportTitle, reportSubtitle, headers, dataRows, totalsRow, columnWidths } = options;
  const aoa: (string | number)[][] = [];

  // 1. Banner Institucional
  aoa.push([sanitizeExcelCell(storeName.toUpperCase())]);
  aoa.push([sanitizeExcelCell(reportTitle.toUpperCase())]);
  aoa.push([sanitizeExcelCell(reportSubtitle)]);
  aoa.push([`Generado: ${formatDateTime(new Date())} | Moneda: Soles (PEN)`]);
  aoa.push([]); // Espacio en blanco

  // 2. Encabezados de Columnas de la Tabla
  aoa.push(headers);

  // 3. Filas de Datos sanitizadas
  dataRows.forEach((row) => aoa.push(row.map(sanitizeExcelCell)));

  // 4. Fila de Totales Generales
  if (totalsRow) {
    aoa.push([]); // Espacio separador
    aoa.push(totalsRow.map(sanitizeExcelCell));
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // 5. Cálculo y asignación de anchos de columna
  if (columnWidths && columnWidths.length === headers.length) {
    ws['!cols'] = columnWidths.map((w) => ({ wch: w }));
  } else {
    const computedCols = headers.map((headerText, colIndex) => {
      let maxLen = headerText.length;
      dataRows.forEach((row) => {
        const val = row[colIndex];
        if (val !== undefined && val !== null) {
          const s = String(val);
          if (s.length > maxLen) maxLen = s.length;
        }
      });
      if (totalsRow && totalsRow[colIndex]) {
        const s = String(totalsRow[colIndex]);
        if (s.length > maxLen) maxLen = s.length;
      }
      return { wch: Math.min(Math.max(maxLen + 4, 13), 50) };
    });
    ws['!cols'] = computedCols;
  }

  return ws;
}

/**
 * =========================================================================
 * 1. EXPORTAR REPORTE COMPLETO DE KARDEX & INVENTARIO A EXCEL
 * =========================================================================
 */
export const exportKardexAndInventoryExcel = (
  products: Product[],
  kardexMovements: KardexMovement[],
  storeName = 'Comercial Rodrigo',
) => {
  const wb = XLSX.utils.book_new();
  const dateSuffix = getPeruYMD();

  // --- HOJA 1: Stock Valorizado ---
  let sumStock = 0;
  let sumValuedCost = 0;
  let sumValuedRetail = 0;

  const stockRows = products.map((p, idx) => {
    const cost = Number((p.costPrice || 0).toFixed(2));
    const stock = Number((p.currentStock || 0).toFixed(3));
    const totalValuedCost = Number((stock * cost).toFixed(2));
    const totalValuedRetail = Number((stock * (p.retailPrice || 0)).toFixed(2));
    const retailMargin = cost > 0 ? Number((((p.retailPrice - cost) / cost) * 100).toFixed(1)) : 0;
    const expInfo = getProductExpirationInfo(p.expirationDate);
    
    sumStock += stock;
    sumValuedCost += totalValuedCost;
    sumValuedRetail += totalValuedRetail;

    let stockStatus = 'Óptimo';
    if (stock <= 0) stockStatus = 'AGOTADO';
    else if (stock <= p.minStock) stockStatus = 'STOCK BAJO';

    return [
      idx + 1,
      p.barcode || 'S/C',
      p.name,
      p.category?.name || 'General',
      getUnitBadge(p.unitType),
      stock,
      p.minStock,
      expInfo.formattedDate !== '--' ? expInfo.formattedDate : 'No perecible',
      expInfo.label,
      cost,
      totalValuedCost,
      p.retailPrice,
      `${retailMargin}%`,
      p.wholesalePrice ? p.wholesalePrice : 'No aplica',
      p.wholesaleMinQty ? p.wholesaleMinQty : '-',
      totalValuedRetail,
      stockStatus,
    ];
  });

  const stockHeaders = [
    'N°',
    'Código Barras',
    'Producto / Descripción',
    'Categoría',
    'Unidad SUNAT',
    'Stock Actual',
    'Stock Mínimo',
    'F. Vencimiento',
    'Estado Vencimiento',
    'Costo Unit. (S/.)',
    'Valor Costo Total (S/.)',
    'Precio Menor (S/.)',
    'Margen Menor (%)',
    'Precio Mayor (S/.)',
    'Cant. Mín. Mayor',
    'Valor Venta Total (S/.)',
    'Estado Stock',
  ];

  const stockTotals = [
    'TOTALES GENERALES',
    '',
    `${products.length} productos registrados`,
    '',
    '',
    Number(sumStock.toFixed(3)),
    '',
    '',
    '',
    '',
    Number(sumValuedCost.toFixed(2)),
    '',
    '',
    '',
    '',
    Number(sumValuedRetail.toFixed(2)),
    '',
  ];

  const stockColWidths = [6, 17, 36, 18, 14, 13, 13, 16, 22, 16, 22, 16, 16, 16, 16, 22, 16];

  const wsStock = createFormattedSheet({
    storeName,
    reportTitle: 'Control de Inventario & Stock Valorizado',
    reportSubtitle: 'Auditoría física y valoración económica de almacén',
    headers: stockHeaders,
    dataRows: stockRows,
    totalsRow: stockTotals,
    columnWidths: stockColWidths,
  });

  XLSX.utils.book_append_sheet(wb, wsStock, 'Stock Valorizado');

  // --- HOJA 2: Movimientos de Kardex ---
  let sumIncomeQty = 0;
  let sumOutQty = 0;

  const kardexRows = kardexMovements.map((m, idx) => {
    const isIncome =
      m.movementType === 'PURCHASE' ||
      m.movementType === 'RETURN_SALE' ||
      m.movementType === 'ADJUSTMENT_IN';

    const qty = Number(m.quantity || 0);
    if (isIncome) sumIncomeQty += qty;
    else sumOutQty += qty;

    return [
      idx + 1,
      formatDateTime(m.createdAt),
      m.productName,
      m.barcode || 'S/C',
      translateMovementType(m.movementType),
      isIncome ? qty : 0,
      !isIncome ? qty : 0,
      getUnitShortName(m.unitType),
      m.previousStock,
      m.newStock,
      m.unitCost || 0,
      m.reason || '--',
      m.userName || 'Sistema',
    ];
  });

  const kardexHeaders = [
    'N°',
    'Fecha y Hora',
    'Producto',
    'Código',
    'Tipo Movimiento',
    'Entradas (+)',
    'Salidas (-)',
    'Unidad',
    'Stock Anterior',
    'Stock Resultante',
    'Costo Unit. (S/.)',
    'Operación / Referencia',
    'Responsable / Cajero',
  ];

  const kardexTotals = [
    'TOTALES GENERALES',
    '',
    `${kardexMovements.length} movimientos registrados`,
    '',
    '',
    Number(sumIncomeQty.toFixed(3)),
    Number(sumOutQty.toFixed(3)),
    '',
    '',
    '',
    '',
    '',
    '',
  ];

  const kardexColWidths = [6, 20, 32, 16, 20, 14, 14, 12, 14, 15, 16, 30, 20];

  const wsKardex = createFormattedSheet({
    storeName,
    reportTitle: 'Auditoría y Trazabilidad de Kardex',
    reportSubtitle: 'Historial cronológico de ventas, compras y ajustes de stock',
    headers: kardexHeaders,
    dataRows: kardexRows,
    totalsRow: kardexTotals,
    columnWidths: kardexColWidths,
  });

  XLSX.utils.book_append_sheet(wb, wsKardex, 'Movimientos Kardex');

  // --- HOJA 3: Alertas de Reposición (Stock Bajo / Agotado) ---
  const alertProducts = products.filter((p) => (p.currentStock || 0) <= (p.minStock || 0));
  let sumDeficit = 0;
  let sumAlertBudget = 0;

  const alertRows = alertProducts.map((p, idx) => {
    const deficit = Number(Math.max(0, p.minStock - p.currentStock).toFixed(3));
    const cost = p.costPrice || 0;
    const estPurchaseBudget = Number((deficit * cost).toFixed(2));
    sumDeficit += deficit;
    sumAlertBudget += estPurchaseBudget;

    return [
      idx + 1,
      p.barcode || 'S/C',
      p.name,
      p.category?.name || 'General',
      getUnitBadge(p.unitType),
      p.currentStock,
      p.minStock,
      deficit,
      cost,
      estPurchaseBudget,
      p.currentStock <= 0 ? 'URGENTE (AGOTADO)' : 'ATENCIÓN (STOCK BAJO)',
    ];
  });

  const alertHeaders = [
    'N°',
    'Código',
    'Producto',
    'Categoría',
    'Unidad SUNAT',
    'Stock Actual',
    'Stock Mínimo',
    'Déficit a Reponer',
    'Costo Unit. Estimado (S/.)',
    'Presupuesto Compra (S/.)',
    'Prioridad',
  ];

  const alertTotals = [
    'TOTAL PRESUPUESTO REPOSICIÓN',
    '',
    `${alertProducts.length} artículos críticos`,
    '',
    '',
    '',
    '',
    Number(sumDeficit.toFixed(3)),
    '',
    Number(sumAlertBudget.toFixed(2)),
    '',
  ];

  const alertColWidths = [6, 16, 32, 18, 14, 13, 13, 16, 22, 22, 22];

  const wsAlerts = createFormattedSheet({
    storeName,
    reportTitle: 'Alertas de Compra & Reposición de Mercadería',
    reportSubtitle: 'Productos con stock crítico bajo o agotado que requieren reposición',
    headers: alertHeaders,
    dataRows: alertRows.length > 0 ? alertRows : [['--', '--', 'No hay productos con stock bajo', '--', '--', 0, 0, 0, 0, 0, 'ÓPTIMO']],
    totalsRow: alertRows.length > 0 ? alertTotals : undefined,
    columnWidths: alertColWidths,
  });

  XLSX.utils.book_append_sheet(wb, wsAlerts, 'Alertas de Compra');

  const cleanStore = storeName.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `Kardex_Inventario_${cleanStore}_${dateSuffix}.xlsx`;
  XLSX.writeFile(wb, filename);
};

/**
 * =========================================================================
 * 2. EXPORTAR REPORTE COMPLETO DE AUDITORÍA DE CAJAS & ARQUEOS A EXCEL
 * =========================================================================
 */
export const exportShiftAuditExcel = (
  shifts: any[],
  storeName = 'Comercial Rodrigo',
) => {
  const wb = XLSX.utils.book_new();
  const dateSuffix = getPeruYMD();

  // --- HOJA 1: Resumen de Turnos y Arqueos ---
  let sumInitial = 0;
  let sumCash = 0;
  let sumDigital = 0;
  let sumCard = 0;
  let sumMixed = 0;
  let sumSales = 0;
  let sumIncome = 0;
  let sumExpenses = 0;
  let sumExpected = 0;
  let sumActual = 0;
  let sumDiff = 0;

  const shiftRows = shifts.map((s, idx) => {
    const diff = s.difference !== null && s.difference !== undefined ? Number(s.difference) : 0;
    const initial = Number(s.initialBalance || 0);
    const cash = Number(s.metrics?.cashFromSales || 0);
    const digital = Number(s.metrics?.yapePlinSales || 0);
    const card = Number(s.metrics?.cardSales || 0);
    const mixed = Number(s.metrics?.mixedSales || 0);
    const totalSales = Number(s.metrics?.totalSales || 0);
    const income = Number(s.metrics?.incomeMovements || 0);
    const expenses = Number(s.metrics?.expenseMovements || 0);
    const expected = s.expectedBalance != null ? Number(s.expectedBalance) : initial + cash + income - expenses;
    const actual = s.actualBalance != null ? Number(s.actualBalance) : expected;

    sumInitial += initial;
    sumCash += cash;
    sumDigital += digital;
    sumCard += card;
    sumMixed += mixed;
    sumSales += totalSales;
    sumIncome += income;
    sumExpenses += expenses;
    sumExpected += expected;
    sumActual += actual;
    sumDiff += diff;

    let diagnostic = 'TURNO ABIERTO';
    if (s.status === 'CLOSED') {
      if (Math.abs(diff) < 0.05) diagnostic = 'CONFORME (CUADRE EXACTO)';
      else if (diff > 0) diagnostic = `SOBRANTE (+S/ ${diff.toFixed(2)})`;
      else diagnostic = `FALTANTE (-S/ ${Math.abs(diff).toFixed(2)})`;
    }

    return [
      idx + 1,
      s.cashRegister?.name || 'Caja',
      s.cashRegister?.identifier || '--',
      s.user?.name || '--',
      formatDateTime(s.openedAt),
      s.closedAt ? formatDateTime(s.closedAt) : 'En operación (Abierto)',
      s.status === 'OPEN' ? 'ABIERTO' : 'CERRADO',
      initial,
      cash,
      digital,
      card,
      mixed,
      totalSales,
      income,
      expenses,
      expected,
      s.actualBalance != null ? actual : '--',
      s.difference != null ? diff : '--',
      diagnostic,
      s.notes || 'Ninguna',
    ];
  });

  const shiftHeaders = [
    'N°',
    'Caja Física',
    'Identificador',
    'Cajero Responsable',
    'Fecha Apertura',
    'Fecha Cierre',
    'Estado',
    'Fondo Inicial (S/.)',
    'Ventas Efectivo (S/.)',
    'Ventas Yape/Plin (S/.)',
    'Ventas Tarjeta (S/.)',
    'Ventas Mixtas (S/.)',
    'Total Ventas Cobradas (S/.)',
    'Ingresos Gaveta (S/.)',
    'Gastos Gaveta (S/.)',
    'Saldo Esperado (S/.)',
    'Conteo Físico Declarado (S/.)',
    'Diferencia Cuadre (S/.)',
    'Diagnóstico',
    'Observaciones',
  ];

  const shiftTotals = [
    'TOTALES GENERALES',
    '',
    `${shifts.length} turnos auditados`,
    '',
    '',
    '',
    '',
    Number(sumInitial.toFixed(2)),
    Number(sumCash.toFixed(2)),
    Number(sumDigital.toFixed(2)),
    Number(sumCard.toFixed(2)),
    Number(sumMixed.toFixed(2)),
    Number(sumSales.toFixed(2)),
    Number(sumIncome.toFixed(2)),
    Number(sumExpenses.toFixed(2)),
    Number(sumExpected.toFixed(2)),
    Number(sumActual.toFixed(2)),
    Number(sumDiff.toFixed(2)),
    sumDiff === 0 ? 'CUADRE TOTAL EXACTO' : sumDiff > 0 ? 'SOBRANTE NETO' : 'FALTANTE NETO',
    '',
  ];

  const shiftColWidths = [6, 14, 14, 24, 20, 20, 12, 17, 18, 18, 18, 18, 22, 17, 17, 18, 22, 18, 26, 26];

  const wsShifts = createFormattedSheet({
    storeName,
    reportTitle: 'Auditoría de Turnos de Caja & Arqueos Físicos',
    reportSubtitle: 'Control financiero de aperturas, cobros por canal, gavetas y diferencias de dinero',
    headers: shiftHeaders,
    dataRows: shiftRows,
    totalsRow: shiftTotals,
    columnWidths: shiftColWidths,
  });

  XLSX.utils.book_append_sheet(wb, wsShifts, 'Resumen de Cajas y Arqueos');

  // --- HOJA 2: Desglose de Tickets y Ventas ---
  const salesRows: (string | number)[][] = [];
  let sumSalesTickets = 0;
  let sumCashPaid = 0;
  let sumDigitalPaid = 0;

  shifts.forEach((s) => {
    const shiftLabel = `${s.cashRegister?.name} (${s.user?.name})`;
    const salesList = s.sales || [];
    salesList.forEach((sale: any) => {
      const total = Number(sale.totalAmount || 0);
      const change = Number(sale.changeAmount || 0);
      const cash =
        sale.paymentMethod === 'TRANSFER' || sale.paymentMethod === 'CARD'
          ? 0
          : Math.max(0, Number(sale.cashPaid || 0) - change);
      const digital = Number(sale.digitalPaid || 0);
      sumSalesTickets += total;
      sumCashPaid += cash;
      sumDigitalPaid += digital;

      salesRows.push([
        `#${String(sale.saleNumber || '--').padStart(5, '0')}`,
        formatDateTime(sale.createdAt),
        shiftLabel,
        translatePaymentMethod(sale.paymentMethod),
        cash,
        digital,
        total,
      ]);
    });
  });

  const salesHeaders = [
    'N° Ticket',
    'Fecha y Hora',
    'Caja y Turno',
    'Método de Pago',
    'Efectivo en Caja (S/.)',
    'Digital Recibido (S/.)',
    'Total Cobrado (S/.)',
  ];

  const salesTotals = [
    'TOTAL TICKETS EMITIDOS',
    '',
    `${salesRows.length} ventas realizadas`,
    '',
    Number(sumCashPaid.toFixed(2)),
    Number(sumDigitalPaid.toFixed(2)),
    Number(sumSalesTickets.toFixed(2)),
  ];

  const salesColWidths = [14, 20, 26, 16, 20, 20, 20];

  const wsSales = createFormattedSheet({
    storeName,
    reportTitle: 'Relación de Tickets y Ventas de Turnos',
    reportSubtitle: 'Detalle de comprobantes emitidos durante los turnos auditados',
    headers: salesHeaders,
    dataRows: salesRows.length > 0 ? salesRows : [['--', '--', 'Sin tickets registrados', '--', 0, 0, 0]],
    totalsRow: salesRows.length > 0 ? salesTotals : undefined,
    columnWidths: salesColWidths,
  });

  XLSX.utils.book_append_sheet(wb, wsSales, 'Tickets y Ventas');

  // --- HOJA 3: Movimientos de Caja Menor (Gastos / Ingresos manuales) ---
  const movementRows: (string | number)[][] = [];
  let sumMovementExpenses = 0;
  let sumMovementIncome = 0;

  shifts.forEach((s) => {
    const shiftLabel = `${s.cashRegister?.name} (${s.user?.name})`;
    const movementsList = s.cashMovements || [];
    movementsList.forEach((m: any, idx: number) => {
      const amount = Number(m.amount || 0);
      if (m.type === 'INCOME') sumMovementIncome += amount;
      else sumMovementExpenses += amount;

      movementRows.push([
        idx + 1,
        formatDateTime(m.createdAt),
        shiftLabel,
        m.type === 'INCOME' ? 'INGRESO (+)' : 'EGRESO / GASTO (-)',
        amount,
        m.reason || 'Sin motivo especificado',
      ]);
    });
  });

  const movementHeaders = [
    'N°',
    'Fecha y Hora',
    'Caja y Turno',
    'Tipo Movimiento',
    'Monto (S/.)',
    'Motivo / Justificación',
  ];

  const movementTotals = [
    'TOTALES CAJA MENOR',
    '',
    `${movementRows.length} movimientos de gaveta`,
    `Ingresos: S/ ${sumMovementIncome.toFixed(2)} | Gastos: S/ ${sumMovementExpenses.toFixed(2)}`,
    Number((sumMovementIncome - sumMovementExpenses).toFixed(2)),
    'Saldo Neto Movimientos',
  ];

  const movementColWidths = [6, 20, 26, 20, 18, 36];

  const wsMovements = createFormattedSheet({
    storeName,
    reportTitle: 'Movimientos Manuales de Caja Menor (Gaveta)',
    reportSubtitle: 'Registro de gastos imprevistos, retiros autorizados e inyecciones de sencillo',
    headers: movementHeaders,
    dataRows: movementRows.length > 0 ? movementRows : [['--', '--', '--', 'Sin movimientos registrados', 0, '--']],
    totalsRow: movementRows.length > 0 ? movementTotals : undefined,
    columnWidths: movementColWidths,
  });

  XLSX.utils.book_append_sheet(wb, wsMovements, 'Caja Menor y Gastos');

  const cleanStore = storeName.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `Auditoria_Cajas_${cleanStore}_${dateSuffix}.xlsx`;
  XLSX.writeFile(wb, filename);
};

/**
 * =========================================================================
 * 3. EXPORTAR REPORTE COMPLETO DE GANANCIAS & RENTABILIDAD A EXCEL (.xlsx)
 * =========================================================================
 */
export const exportProfitReportExcel = (
  reportData: {
    summary: {
      totalSales: number;
      totalCost: number;
      grossProfit: number;
      totalExpenses: number;
      netProfit: number;
      grossMarginPct: number;
      netMarginPct: number;
      salesCount: number;
      totalUnitsSold: number;
      cashPaidTotal: number;
      digitalPaidTotal: number;
      paymentMethods: Record<string, number>;
    };
    products: Array<{
      productId: string;
      productName: string;
      barcode: string | null;
      categoryName: string;
      unitType: string;
      quantitySold: number;
      totalRevenue: number;
      totalCost: number;
      profit: number;
      marginPct: number;
    }>;
    sales: Array<{
      id: string;
      saleNumber: number;
      createdAt: string;
      customerName: string | null;
      paymentMethod: string;
      cashPaid: number;
      digitalPaid: number;
      totalAmount: number;
      totalCost: number;
      profit: number;
      marginPct: number;
      unitsCount: number;
      cashier: string;
      cashRegister: string;
      items: Array<{
        productName: string;
        quantity: number;
        unitPrice: number;
        costPrice: number;
        subtotal: number;
        itemCost: number;
        profit: number;
      }>;
    }>;
    expenses?: Array<{
      id: string;
      amount: number;
      reason: string;
      createdAt: string;
      cashRegister: string;
      cashier: string;
    }>;
  },
  dateLabel: string,
  storeName = 'Comercial Rodrigo',
) => {
  const wb = XLSX.utils.book_new();
  const dateSuffix = getPeruYMD();
  const { summary, products, sales, expenses = [] } = reportData;

  // --- HOJA 1: Resumen Ejecutivo Financiero ---
  const summaryAoa: (string | number)[][] = [
    [storeName.toUpperCase()],
    ['ESTADO FINANCIERO DE GANANCIAS & RENTABILIDAD'],
    [`Período de Análisis: ${dateLabel} | Emisión: ${formatDateTime(new Date())}`],
    ['Moneda Oficial: Soles Peruanos (PEN)'],
    [],
    ['CONCEPTO FINANCIERO', 'VALOR / INDICADOR OFICIAL', 'OBSERVACIÓN / DETALLE'],
    ['1. INGRESOS POR VENTAS NETAS', summary.totalSales, 'Facturación total cobrada en POS'],
    ['2. COSTO DE MERCADERÍA VENDIDA (CMV)', summary.totalCost, 'Costo de adquisición de productos vendidos'],
    ['3. GANANCIA BRUTA (UTILIDAD BRUTA)', summary.grossProfit, `Rentabilidad Bruta: ${summary.grossMarginPct}%`],
    ['4. GASTOS OPERATIVOS DE CAJA MENOR', summary.totalExpenses, `${expenses.length} egresos o gastos registrados`],
    ['5. GANANCIA NETA REAL (EN BOLSILLO)', summary.netProfit, `Margen Neto Real: ${summary.netMarginPct}%`],
    [],
    ['--- INDICADORES OPERATIVOS Y VOLUMEN ---', '', ''],
    ['Total Tickets / Comprobantes Emitidos', summary.salesCount, 'Transacciones de venta realizadas'],
    ['Total Unidades / Artículos Despachados', summary.totalUnitsSold, 'Cantidad física de productos vendidos'],
    ['Ticket Promedio por Cliente (S/.)', summary.salesCount > 0 ? Number((summary.totalSales / summary.salesCount).toFixed(2)) : 0, 'Gasto medio por compra'],
    [],
    ['--- CANALES DE COBRO Y RECAUDACIÓN ---', '', ''],
    ['Ventas en Efectivo Puro (S/.)', summary.paymentMethods?.CASH || 0, 'Dinero líquido recaudado'],
    ['Ventas Yape / Plin / Transferencias (S/.)', summary.paymentMethods?.TRANSFER || 0, 'Cobros por billeteras digitales'],
    ['Ventas con Tarjeta Débito / Crédito (S/.)', summary.paymentMethods?.CARD || 0, 'Cobros mediante POS bancario'],
    ['Ventas con Pago Mixto (S/.)', summary.paymentMethods?.MIXED || 0, 'Combinación efectivo + digital'],
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoa.map((row) => row.map(sanitizeExcelCell)));
  wsSummary['!cols'] = [{ wch: 44 }, { wch: 28 }, { wch: 38 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen Financiero');

  // --- HOJA 2: Rentabilidad por Producto ---
  let sumProdQty = 0;
  let sumProdRevenue = 0;
  let sumProdCost = 0;
  let sumProdProfit = 0;

  const productRows = products.map((p, idx) => {
    sumProdQty += p.quantitySold;
    sumProdRevenue += p.totalRevenue;
    sumProdCost += p.totalCost;
    sumProdProfit += p.profit;

    const avgUnitCost = p.quantitySold > 0 ? Number((p.totalCost / p.quantitySold).toFixed(2)) : 0;
    const avgUnitPrice = p.quantitySold > 0 ? Number((p.totalRevenue / p.quantitySold).toFixed(2)) : 0;

    return [
      idx + 1,
      p.barcode || 'S/C',
      p.productName,
      p.categoryName || 'General',
      getUnitShortName(p.unitType as any),
      p.quantitySold,
      avgUnitCost,
      avgUnitPrice,
      p.totalRevenue,
      p.totalCost,
      p.profit,
      `${p.marginPct}%`,
      p.marginPct >= 30 ? 'ALTA' : p.marginPct >= 15 ? 'MEDIA' : 'BAJA',
    ];
  });

  const productHeaders = [
    'N°',
    'Código Barras',
    'Producto / Descripción',
    'Categoría',
    'Unidad',
    'Cant. Vendida',
    'Costo Unit. Prom. (S/.)',
    'Precio Unit. Prom. (S/.)',
    'Venta Total (S/.)',
    'Costo Total (S/.)',
    'Ganancia Neta (S/.)',
    'Margen (%)',
    'Rentabilidad',
  ];

  const overallProdMargin = sumProdCost > 0 ? Number((((sumProdRevenue - sumProdCost) / sumProdCost) * 100).toFixed(1)) : 0;

  const productTotals = [
    'TOTALES GENERALES',
    '',
    `${products.length} productos analizados`,
    '',
    '',
    Number(sumProdQty.toFixed(3)),
    '',
    '',
    Number(sumProdRevenue.toFixed(2)),
    Number(sumProdCost.toFixed(2)),
    Number(sumProdProfit.toFixed(2)),
    `${overallProdMargin}%`,
    'MARGEN PROMEDIO',
  ];

  const productColWidths = [6, 16, 34, 18, 12, 14, 20, 20, 18, 18, 18, 14, 16];

  const wsProducts = createFormattedSheet({
    storeName,
    reportTitle: 'Rentabilidad & Ganancia por Producto',
    reportSubtitle: `Ranking de productos vendidos en el período (${dateLabel})`,
    headers: productHeaders,
    dataRows: productRows.length > 0 ? productRows : [['--', '--', 'Sin ventas en este período', '--', '--', 0, 0, 0, 0, 0, 0, '0%', '--']],
    totalsRow: productRows.length > 0 ? productTotals : undefined,
    columnWidths: productColWidths,
  });

  XLSX.utils.book_append_sheet(wb, wsProducts, 'Ganancia por Producto');

  // --- HOJA 3: Detalle por Ticket de Venta ---
  let sumTicketSales = 0;
  let sumTicketCost = 0;
  let sumTicketProfit = 0;
  let sumTicketUnits = 0;

  const ticketRows = sales.map((s) => {
    sumTicketSales += s.totalAmount;
    sumTicketCost += s.totalCost;
    sumTicketProfit += s.profit;
    sumTicketUnits += s.unitsCount;

    return [
      `#${String(s.saleNumber).padStart(5, '0')}`,
      formatDateTime(s.createdAt),
      s.cashRegister,
      s.cashier,
      s.customerName || 'Cliente Varios',
      translatePaymentMethod(s.paymentMethod),
      s.unitsCount,
      s.totalAmount,
      s.totalCost,
      s.profit,
      `${s.marginPct}%`,
    ];
  });

  const ticketHeaders = [
    'N° Ticket',
    'Fecha y Hora',
    'Caja',
    'Cajero',
    'Cliente',
    'Método de Pago',
    'Artículos',
    'Total Venta (S/.)',
    'Costo Venta (S/.)',
    'Ganancia Ticket (S/.)',
    'Margen (%)',
  ];

  const overallTicketMargin = sumTicketCost > 0 ? Number((((sumTicketSales - sumTicketCost) / sumTicketCost) * 100).toFixed(1)) : 0;

  const ticketTotals = [
    'TOTAL TICKETS',
    '',
    `${sales.length} comprobantes`,
    '',
    '',
    '',
    Number(sumTicketUnits.toFixed(3)),
    Number(sumTicketSales.toFixed(2)),
    Number(sumTicketCost.toFixed(2)),
    Number(sumTicketProfit.toFixed(2)),
    `${overallTicketMargin}%`,
  ];

  const ticketColWidths = [14, 20, 16, 20, 24, 16, 12, 18, 18, 18, 14];

  const wsTickets = createFormattedSheet({
    storeName,
    reportTitle: 'Auditoría Detallada por Ticket de Venta',
    reportSubtitle: `Margen y ganancia ticket a ticket en el período (${dateLabel})`,
    headers: ticketHeaders,
    dataRows: ticketRows.length > 0 ? ticketRows : [['--', '--', '--', '--', 'Sin tickets', '--', 0, 0, 0, 0, '0%']],
    totalsRow: ticketRows.length > 0 ? ticketTotals : undefined,
    columnWidths: ticketColWidths,
  });

  XLSX.utils.book_append_sheet(wb, wsTickets, 'Detalle por Ticket');

  // --- HOJA 4: Gastos de Caja Menor (si los hubo) ---
  if (expenses.length > 0) {
    let sumExpenseAmount = 0;
    const expenseRows = expenses.map((e, idx) => {
      sumExpenseAmount += e.amount;
      return [
        idx + 1,
        formatDateTime(e.createdAt),
        e.cashRegister,
        e.cashier,
        e.amount,
        e.reason,
      ];
    });

    const expenseHeaders = [
      'N°',
      'Fecha y Hora',
      'Caja',
      'Responsable',
      'Monto Retirado (S/.)',
      'Motivo / Justificación',
    ];

    const expenseTotals = [
      'TOTAL GASTOS RETIRADOS',
      '',
      `${expenses.length} egresos`,
      '',
      Number(sumExpenseAmount.toFixed(2)),
      'Descontado de la ganancia neta',
    ];

    const expenseColWidths = [6, 20, 16, 20, 18, 38];

    const wsExpenses = createFormattedSheet({
      storeName,
      reportTitle: 'Gastos y Salidas de Caja Menor',
      reportSubtitle: `Egresos de gaveta que descuentan la utilidad (${dateLabel})`,
      headers: expenseHeaders,
      dataRows: expenseRows,
      totalsRow: expenseTotals,
      columnWidths: expenseColWidths,
    });

    XLSX.utils.book_append_sheet(wb, wsExpenses, 'Gastos de Caja Menor');
  }

  const cleanStore = storeName.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `Reporte_Ganancias_${cleanStore}_${dateSuffix}.xlsx`;
  XLSX.writeFile(wb, filename);
};
