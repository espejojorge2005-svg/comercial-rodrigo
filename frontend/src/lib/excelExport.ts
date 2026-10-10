import * as XLSX from 'xlsx';
import type { Product, KardexMovement } from '../types/index.js';
import { getUnitBadge, getUnitShortName } from './units.js';

/**
 * Función auxiliar para formatear fecha a string legible: DD/MM/YYYY HH:mm
 */
const formatDateTime = (dateStr?: string | Date | null): string => {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '--';
  return d.toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Traduce el tipo de movimiento de Kardex al español corporativo
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
      return method;
  }
};

/**
 * Calcula anchos automáticos de columnas para que no se trunque el contenido en Excel
 */
const calculateColWidths = (data: Record<string, any>[]): { wch: number }[] => {
  if (!data || data.length === 0) return [];
  const keys = Object.keys(data[0]);
  return keys.map((key) => {
    let maxLen = key.length;
    data.forEach((row) => {
      const val = row[key];
      if (val !== null && val !== undefined) {
        const strVal = String(val);
        if (strVal.length > maxLen) {
          maxLen = strVal.length;
        }
      }
    });
    return { wch: Math.min(Math.max(maxLen + 3, 12), 45) };
  });
};

/**
 * EXPORTAR REPORTE COMPLETO DE KARDEX & INVENTARIO A EXCEL
 */
export const exportKardexAndInventoryExcel = (
  products: Product[],
  kardexMovements: KardexMovement[],
  storeName = 'Comercial Rodrigo',
) => {
  const wb = XLSX.utils.book_new();
  const dateSuffix = new Date().toISOString().split('T')[0];

  // 1. HOJA 1: Stock Valorizado Actual
  const stockRows = products.map((p) => {
    const cost = p.costPrice || 0;
    const stock = p.currentStock || 0;
    const totalValuedCost = Number((stock * cost).toFixed(2));
    const retailMargin = cost > 0 ? Number((((p.retailPrice - cost) / cost) * 100).toFixed(1)) : 0;
    const isOutOfStock = stock <= 0;
    const isLowStock = stock <= p.minStock && !isOutOfStock;

    let stockStatus = 'Óptimo';
    if (isOutOfStock) stockStatus = 'AGOTADO';
    else if (isLowStock) stockStatus = 'STOCK BAJO';

    return {
      'Código de Barras': p.barcode || 'S/C',
      'Producto': p.name,
      'Categoría': p.category?.name || 'General',
      'Unidad SUNAT': getUnitBadge(p.unitType),
      'Stock Actual': stock,
      'Stock Mínimo': p.minStock,
      'Costo Unitario (S/.)': cost,
      'Valor en Almacén (S/.)': totalValuedCost,
      'Precio Menor (S/.)': p.retailPrice,
      'Margen Menor (%)': `${retailMargin}%`,
      'Precio Mayor (S/.)': p.wholesalePrice ? p.wholesalePrice : 'No aplica',
      'Cant. Mín. Mayor': p.wholesaleMinQty ? p.wholesaleMinQty : '-',
      'Estado': stockStatus,
    };
  });

  const wsStock = XLSX.utils.json_to_sheet(stockRows);
  wsStock['!cols'] = calculateColWidths(stockRows);
  XLSX.utils.book_append_sheet(wb, wsStock, 'Stock Valorizado');

  // 2. HOJA 2: Movimientos Históricos de Kardex
  const kardexRows = kardexMovements.map((m) => {
    const isIncome =
      m.movementType === 'PURCHASE' ||
      m.movementType === 'RETURN_SALE' ||
      m.movementType === 'ADJUSTMENT_IN';

    return {
      'Fecha y Hora': formatDateTime(m.createdAt),
      'Producto': m.productName,
      'Código': m.barcode || 'S/C',
      'Tipo de Movimiento': translateMovementType(m.movementType),
      'Variación': `${isIncome ? '+' : '-'}${m.quantity}`,
      'Unidad': getUnitShortName(m.unitType),
      'Stock Anterior': m.previousStock,
      'Stock Resultante': m.newStock,
      'Costo Unit. (S/.)': m.unitCost,
      'Operación / Referencia': m.reason,
      'Responsable / Cajero': m.userName,
    };
  });

  const wsKardex = XLSX.utils.json_to_sheet(kardexRows);
  wsKardex['!cols'] = calculateColWidths(kardexRows);
  XLSX.utils.book_append_sheet(wb, wsKardex, 'Movimientos Kardex');

  // 3. HOJA 3: Alertas de Reposición (Stock Bajo / Agotado)
  const alertProducts = products.filter((p) => (p.currentStock || 0) <= (p.minStock || 0));
  const alertRows = alertProducts.map((p) => {
    const deficit = Math.max(0, p.minStock - p.currentStock);
    const cost = p.costPrice || 0;
    const estPurchaseBudget = Number((deficit * cost).toFixed(2));

    return {
      'Código': p.barcode || 'S/C',
      'Producto': p.name,
      'Categoría': p.category?.name || 'General',
      'Unidad': getUnitBadge(p.unitType),
      'Stock Actual': p.currentStock,
      'Stock Mínimo': p.minStock,
      'Déficit a Comprar': deficit,
      'Costo Unit. Estimado (S/.)': cost,
      'Presupuesto Compra (S/.)': estPurchaseBudget,
      'Prioridad': p.currentStock <= 0 ? 'URGENTE (AGOTADO)' : 'ATENCIÓN (STOCK BAJO)',
    };
  });

  const wsAlerts = XLSX.utils.json_to_sheet(alertRows.length > 0 ? alertRows : [{ 'Estado': 'No hay productos con stock bajo' }]);
  wsAlerts['!cols'] = calculateColWidths(alertRows.length > 0 ? alertRows : [{ 'Estado': 'No hay productos con stock bajo' }]);
  XLSX.utils.book_append_sheet(wb, wsAlerts, 'Alertas de Compra');

  // Descarga directa
  const cleanStore = storeName.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `Kardex_Inventario_${cleanStore}_${dateSuffix}.xlsx`;
  XLSX.writeFile(wb, filename);
};

/**
 * EXPORTAR REPORTE COMPLETO DE AUDITORÍA DE CAJAS & ARQUEOS A EXCEL
 */
export const exportShiftAuditExcel = (
  shifts: any[],
  storeName = 'Comercial Rodrigo',
) => {
  const wb = XLSX.utils.book_new();
  const dateSuffix = new Date().toISOString().split('T')[0];

  // 1. HOJA 1: Resumen de Turnos y Arqueos Ciegos
  const shiftRows = shifts.map((s) => {
    const diff = s.difference !== null && s.difference !== undefined ? Number(s.difference) : null;
    let diagnostic = 'TURNO ABIERTO';
    if (s.status === 'CLOSED') {
      if (diff === null || Math.abs(diff) < 0.05) diagnostic = 'CONFORME (CUADRE EXACTO)';
      else if (diff > 0) diagnostic = `SOBRANTE (+S/ ${diff.toFixed(2)})`;
      else diagnostic = `FALTANTE (-S/ ${Math.abs(diff).toFixed(2)})`;
    }

    return {
      'Caja Física': s.cashRegister?.name || 'Caja',
      'Identificador': s.cashRegister?.identifier || '--',
      'Cajero Responsable': s.user?.name || '--',
      'Fecha Apertura': formatDateTime(s.openedAt),
      'Fecha Cierre': formatDateTime(s.closedAt),
      'Estado': s.status === 'OPEN' ? 'ABIERTO' : 'CERRADO',
      'Fondo Inicial (S/.)': s.initialBalance || 0,
      'Ventas Efectivo (S/.)': s.metrics?.cashFromSales || 0,
      'Ventas Yape/Plin (S/.)': s.metrics?.yapePlinSales || 0,
      'Ventas Tarjeta (S/.)': s.metrics?.cardSales || 0,
      'Ventas Mixtas (S/.)': s.metrics?.mixedSales || 0,
      'Total Cobrado (S/.)': s.metrics?.totalSales || 0,
      'Ingresos Caja Menor (S/.)': s.metrics?.incomeMovements || 0,
      'Gastos Caja Menor (S/.)': s.metrics?.expenseMovements || 0,
      'Saldo Esperado en Gaveta (S/.)': s.expectedBalance !== null ? s.expectedBalance : '--',
      'Arqueo Físico Declarado (S/.)': s.actualBalance !== null ? s.actualBalance : '--',
      'Diferencia Cuadre (S/.)': diff !== null ? diff : '--',
      'Diagnóstico': diagnostic,
      'Observaciones': s.notes || 'Ninguna',
    };
  });

  const wsShifts = XLSX.utils.json_to_sheet(shiftRows);
  wsShifts['!cols'] = calculateColWidths(shiftRows);
  XLSX.utils.book_append_sheet(wb, wsShifts, 'Resumen de Cajas y Arqueos');

  // 2. HOJA 2: Desglose de Ventas del Período
  const salesRows: Record<string, any>[] = [];
  shifts.forEach((s) => {
    const shiftLabel = `${s.cashRegister?.name} (${s.user?.name})`;
    const salesList = s.sales || [];
    salesList.forEach((sale: any) => {
      salesRows.push({
        'N° Ticket': `#${sale.saleNumber || '--'}`,
        'Fecha y Hora': formatDateTime(sale.createdAt),
        'Caja y Turno': shiftLabel,
        'Método de Pago': translatePaymentMethod(sale.paymentMethod),
        'Efectivo Recibido (S/.)': sale.cashPaid || 0,
        'Digital Recibido (S/.)': sale.digitalPaid || 0,
        'Total Ticket (S/.)': sale.totalAmount || 0,
      });
    });
  });

  const wsSales = XLSX.utils.json_to_sheet(
    salesRows.length > 0 ? salesRows : [{ 'Detalle': 'No se encontraron tickets registrados en los turnos' }]
  );
  wsSales['!cols'] = calculateColWidths(
    salesRows.length > 0 ? salesRows : [{ 'Detalle': 'No se encontraron tickets registrados en los turnos' }]
  );
  XLSX.utils.book_append_sheet(wb, wsSales, 'Tickets y Ventas');

  // 3. HOJA 3: Movimientos de Caja Menor (Ingresos / Gastos de gaveta)
  const movementRows: Record<string, any>[] = [];
  shifts.forEach((s) => {
    const shiftLabel = `${s.cashRegister?.name} (${s.user?.name})`;
    const movementsList = s.cashMovements || [];
    movementsList.forEach((m: any) => {
      movementRows.push({
        'Fecha y Hora': formatDateTime(m.createdAt),
        'Caja y Turno': shiftLabel,
        'Tipo Movimiento': m.type === 'INCOME' ? 'INGRESO (+)' : 'EGRESO / GASTO (-)',
        'Monto (S/.)': m.amount || 0,
        'Motivo / Justificación': m.reason || 'Sin motivo especificado',
      });
    });
  });

  const wsMovements = XLSX.utils.json_to_sheet(
    movementRows.length > 0 ? movementRows : [{ 'Detalle': 'No se registraron movimientos manuales de gaveta' }]
  );
  wsMovements['!cols'] = calculateColWidths(
    movementRows.length > 0 ? movementRows : [{ 'Detalle': 'No se registraron movimientos manuales de gaveta' }]
  );
  XLSX.utils.book_append_sheet(wb, wsMovements, 'Caja Menor y Gastos');

  // Descarga directa
  const cleanStore = storeName.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `Auditoria_Cajas_${cleanStore}_${dateSuffix}.xlsx`;
  XLSX.writeFile(wb, filename);
};

/**
 * EXPORTAR REPORTE COMPLETO DE GANANCIAS & RENTABILIDAD A EXCEL (.xlsx)
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
  const dateSuffix = new Date().toISOString().split('T')[0];
  const { summary, products, sales, expenses = [] } = reportData;

  // 1. HOJA 1: Resumen Ejecutivo Financiero
  const summaryRows = [
    { 'Concepto Financiero': 'Empresa / Negocio', 'Detalle / Valor': storeName },
    { 'Concepto Financiero': 'Período Evaluado', 'Detalle / Valor': dateLabel },
    { 'Concepto Financiero': 'Fecha y Hora de Generación', 'Detalle / Valor': formatDateTime(new Date()) },
    { 'Concepto Financiero': '----------------------------------', 'Detalle / Valor': '----------------------' },
    { 'Concepto Financiero': 'Total Ingresos por Ventas (S/.)', 'Detalle / Valor': summary.totalSales },
    { 'Concepto Financiero': 'Costo Total de Mercadería Vendida (S/.)', 'Detalle / Valor': summary.totalCost },
    { 'Concepto Financiero': 'GANANCIA BRUTA (UTILIDAD) (S/.)', 'Detalle / Valor': summary.grossProfit },
    { 'Concepto Financiero': 'Margen Bruto de Rentabilidad (%)', 'Detalle / Valor': `${summary.grossMarginPct}%` },
    { 'Concepto Financiero': 'Total Gastos de Caja Menor (S/.)', 'Detalle / Valor': summary.totalExpenses },
    { 'Concepto Financiero': 'GANANCIA NETA REAL (EN BOLSILLO) (S/.)', 'Detalle / Valor': summary.netProfit },
    { 'Concepto Financiero': 'Margen Neto sobre Ventas (%)', 'Detalle / Valor': `${summary.netMarginPct}%` },
    { 'Concepto Financiero': '----------------------------------', 'Detalle / Valor': '----------------------' },
    { 'Concepto Financiero': 'Cantidad de Tickets / Ventas Realizadas', 'Detalle / Valor': summary.salesCount },
    { 'Concepto Financiero': 'Cantidad de Unidades / Artículos Vendidos', 'Detalle / Valor': summary.totalUnitsSold },
    { 'Concepto Financiero': 'Ticket Promedio (S/.)', 'Detalle / Valor': summary.salesCount > 0 ? Number((summary.totalSales / summary.salesCount).toFixed(2)) : 0 },
    { 'Concepto Financiero': '----------------------------------', 'Detalle / Valor': '----------------------' },
    { 'Concepto Financiero': 'Ventas en Efectivo Puro (S/.)', 'Detalle / Valor': summary.paymentMethods?.CASH || 0 },
    { 'Concepto Financiero': 'Ventas Yape / Plin / Transferencias (S/.)', 'Detalle / Valor': summary.paymentMethods?.TRANSFER || 0 },
    { 'Concepto Financiero': 'Ventas con Tarjeta Débito/Crédito (S/.)', 'Detalle / Valor': summary.paymentMethods?.CARD || 0 },
    { 'Concepto Financiero': 'Ventas con Pago Mixto (S/.)', 'Detalle / Valor': summary.paymentMethods?.MIXED || 0 },
  ];

  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 42 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen Financiero');

  // 2. HOJA 2: Rentabilidad por Producto
  const productRows = products.map((p, idx) => ({
    'N°': idx + 1,
    'Código / Barcode': p.barcode || 'S/C',
    'Producto': p.productName,
    'Categoría': p.categoryName,
    'Unidad': getUnitShortName(p.unitType as any),
    'Unidades Vendidas': p.quantitySold,
    'Ingreso Total (S/.)': p.totalRevenue,
    'Costo Total (S/.)': p.totalCost,
    'Ganancia Neta (S/.)': p.profit,
    'Margen Rentabilidad (%)': `${p.marginPct}%`,
    'Rentabilidad': p.marginPct >= 30 ? 'Alta' : p.marginPct >= 15 ? 'Normal' : 'Baja',
  }));

  const wsProducts = XLSX.utils.json_to_sheet(
    productRows.length > 0 ? productRows : [{ 'Detalle': 'No hubo ventas de productos en este período' }]
  );
  wsProducts['!cols'] = calculateColWidths(
    productRows.length > 0 ? productRows : [{ 'Detalle': 'No hubo ventas de productos en este período' }]
  );
  XLSX.utils.book_append_sheet(wb, wsProducts, 'Ganancia por Producto');

  // 3. HOJA 3: Detalle por Ticket de Venta
  const ticketRows = sales.map((s) => ({
    'N° Ticket': `#${s.saleNumber}`,
    'Fecha y Hora': formatDateTime(s.createdAt),
    'Caja': s.cashRegister,
    'Cajero': s.cashier,
    'Cliente': s.customerName || 'Cliente Varios',
    'Método de Pago': translatePaymentMethod(s.paymentMethod),
    'Total Venta (S/.)': s.totalAmount,
    'Costo Venta (S/.)': s.totalCost,
    'Ganancia Ticket (S/.)': s.profit,
    'Margen (%)': `${s.marginPct}%`,
    'Unidades': s.unitsCount,
  }));

  const wsTickets = XLSX.utils.json_to_sheet(
    ticketRows.length > 0 ? ticketRows : [{ 'Detalle': 'No se registraron tickets en este período' }]
  );
  wsTickets['!cols'] = calculateColWidths(
    ticketRows.length > 0 ? ticketRows : [{ 'Detalle': 'No se registraron tickets en este período' }]
  );
  XLSX.utils.book_append_sheet(wb, wsTickets, 'Detalle por Ticket');

  // 4. HOJA 4: Gastos y Salidas de Caja (si hubo)
  if (expenses.length > 0) {
    const expenseRows = expenses.map((e) => ({
      'Fecha y Hora': formatDateTime(e.createdAt),
      'Caja': e.cashRegister,
      'Responsable': e.cashier,
      'Monto Retirado (S/.)': e.amount,
      'Motivo / Justificación': e.reason,
    }));

    const wsExpenses = XLSX.utils.json_to_sheet(expenseRows);
    wsExpenses['!cols'] = calculateColWidths(expenseRows);
    XLSX.utils.book_append_sheet(wb, wsExpenses, 'Gastos de Caja Menor');
  }

  // Descarga directa
  const cleanStore = storeName.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `Reporte_Ganancias_${cleanStore}_${dateSuffix}.xlsx`;
  XLSX.writeFile(wb, filename);
};

