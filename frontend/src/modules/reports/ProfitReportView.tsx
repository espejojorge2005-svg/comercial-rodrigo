import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../../api/client.js';
import {
  formatCurrency,
  formatPeruDate,
  formatPeruTime,
  getPeruYMD,
} from '../../lib/utils.js';
import { useConfigStore } from '../../store/useConfigStore.js';
import { exportProfitReportExcel } from '../../lib/excelExport.js';
import { getUnitShortName } from '../../lib/units.js';
import {
  TrendingUp,
  Package,
  Receipt,
  FileSpreadsheet,
  RefreshCw,
  Search,
  Wallet,
  Calendar,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Eye,
  X,
  CreditCard,
  QrCode,
  Banknote,
} from 'lucide-react';

interface ProfitSummary {
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
}

interface ProductStat {
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
}

interface SaleItemDetail {
  id: string;
  productId: string;
  productName: string;
  barcode: string | null;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  subtotal: number;
  itemCost: number;
  profit: number;
}

interface SaleRecord {
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
  items: SaleItemDetail[];
}

interface ExpenseRecord {
  id: string;
  amount: number;
  reason: string;
  createdAt: string;
  cashRegister: string;
  cashier: string;
}

interface ProfitReportResponse {
  summary: ProfitSummary;
  products: ProductStat[];
  sales: SaleRecord[];
  expenses: ExpenseRecord[];
}

export const ProfitReportView: React.FC = () => {
  const { config } = useConfigStore();
  const [periodPreset, setPeriodPreset] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('today');
  
  // Fechas por defecto para hoy en hora de Perú (GMT-5)
  const initialTodayYMD = getPeruYMD();
  const [customStart, setCustomStart] = useState<string>(initialTodayYMD);
  const [customEnd, setCustomEnd] = useState<string>(initialTodayYMD);

  const [reportData, setReportData] = useState<ProfitReportResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'products' | 'sales' | 'expenses'>('products');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedSale, setSelectedSale] = useState<SaleRecord | null>(null);

  // Calcula rango ISO con offset -05:00 de Perú y etiqueta humana según el preset
  const getDateRangeParams = useCallback(() => {
    const todayYMD = getPeruYMD(); // YYYY-MM-DD en hora peruana
    const getPeruMidday = (ymdStr: string) => new Date(`${ymdStr}T12:00:00-05:00`);

    if (periodPreset === 'today') {
      return {
        startDate: `${todayYMD}T00:00:00.000-05:00`,
        endDate: `${todayYMD}T23:59:59.999-05:00`,
        label: `Hoy (${formatPeruDate(new Date())})`,
      };
    }

    if (periodPreset === 'yesterday') {
      const d = getPeruMidday(todayYMD);
      d.setDate(d.getDate() - 1);
      const yesterdayYMD = getPeruYMD(d);
      return {
        startDate: `${yesterdayYMD}T00:00:00.000-05:00`,
        endDate: `${yesterdayYMD}T23:59:59.999-05:00`,
        label: `Ayer (${formatPeruDate(d)})`,
      };
    }

    if (periodPreset === 'week') {
      const d = getPeruMidday(todayYMD);
      d.setDate(d.getDate() - 6);
      const weekStartYMD = getPeruYMD(d);
      return {
        startDate: `${weekStartYMD}T00:00:00.000-05:00`,
        endDate: `${todayYMD}T23:59:59.999-05:00`,
        label: `Últimos 7 días (${formatPeruDate(d)} al ${formatPeruDate(new Date())})`,
      };
    }

    if (periodPreset === 'month') {
      const [yearStr, monthStr] = todayYMD.split('-');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      const firstDayYMD = `${yearStr}-${monthStr}-01`;
      const lastDayNum = new Date(year, month, 0).getDate();
      const lastDayYMD = `${yearStr}-${monthStr}-${String(lastDayNum).padStart(2, '0')}`;
      return {
        startDate: `${firstDayYMD}T00:00:00.000-05:00`,
        endDate: `${lastDayYMD}T23:59:59.999-05:00`,
        label: `Este Mes (${monthStr}/${yearStr})`,
      };
    }

    // Custom
    return {
      startDate: customStart ? `${customStart}T00:00:00.000-05:00` : undefined,
      endDate: customEnd ? `${customEnd}T23:59:59.999-05:00` : undefined,
      label: `Del ${customStart} al ${customEnd}`,
    };
  }, [periodPreset, customStart, customEnd]);

  // Consultar reporte a la API
  const fetchReport = useCallback(async () => {
    setIsLoading(true);
    try {
      const { startDate, endDate } = getDateRangeParams();
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const res = await apiRequest<ProfitReportResponse>(`/sales/profit-report?${params.toString()}`);
      setReportData(res);
    } catch (err) {
      console.error('Error al cargar reporte de ganancias:', err);
    } finally {
      setIsLoading(false);
    }
  }, [getDateRangeParams]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const { label: currentPeriodLabel } = getDateRangeParams();

  // Filtrado de productos por búsqueda
  const filteredProducts = (reportData?.products || []).filter((p) => {
    const q = searchTerm.toLowerCase();
    return (
      p.productName.toLowerCase().includes(q) ||
      (p.barcode && p.barcode.includes(q)) ||
      p.categoryName.toLowerCase().includes(q)
    );
  });

  // Filtrado de ventas por búsqueda
  const filteredSales = (reportData?.sales || []).filter((s) => {
    const q = searchTerm.toLowerCase();
    return (
      s.saleNumber.toString().includes(q) ||
      (s.customerName && s.customerName.toLowerCase().includes(q)) ||
      s.cashier.toLowerCase().includes(q) ||
      s.cashRegister.toLowerCase().includes(q)
    );
  });

  // Filtrado de gastos por búsqueda
  const filteredExpenses = (reportData?.expenses || []).filter((e) => {
    const q = searchTerm.toLowerCase();
    return (
      e.reason.toLowerCase().includes(q) ||
      e.cashier.toLowerCase().includes(q) ||
      e.cashRegister.toLowerCase().includes(q)
    );
  });

  // Totales para tabla de Productos
  const prodTotalQty = filteredProducts.reduce((acc, p) => acc + (p.quantitySold || 0), 0);
  const prodTotalRev = filteredProducts.reduce((acc, p) => acc + (p.totalRevenue || 0), 0);
  const prodTotalCost = filteredProducts.reduce((acc, p) => acc + (p.totalCost || 0), 0);
  const prodTotalProfit = filteredProducts.reduce((acc, p) => acc + (p.profit || 0), 0);
  const prodAvgMargin = prodTotalRev > 0 ? ((prodTotalProfit / prodTotalRev) * 100).toFixed(1) : '0.0';

  // Totales para tabla de Ventas
  const salesTotalRev = filteredSales.reduce((acc, s) => acc + (s.totalAmount || 0), 0);
  const salesTotalCost = filteredSales.reduce((acc, s) => acc + (s.totalCost || 0), 0);
  const salesTotalProfit = filteredSales.reduce((acc, s) => acc + (s.profit || 0), 0);
  const salesAvgMargin = salesTotalRev > 0 ? ((salesTotalProfit / salesTotalRev) * 100).toFixed(1) : '0.0';

  // Totales para tabla de Gastos
  const expensesTotalAmount = filteredExpenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);

  const summary = reportData?.summary || {
    totalSales: 0,
    totalCost: 0,
    grossProfit: 0,
    totalExpenses: 0,
    netProfit: 0,
    grossMarginPct: 0,
    netMarginPct: 0,
    salesCount: 0,
    totalUnitsSold: 0,
    cashPaidTotal: 0,
    digitalPaidTotal: 0,
    paymentMethods: { CASH: 0, CARD: 0, TRANSFER: 0, MIXED: 0 },
  };

  const handleExportExcel = () => {
    if (!reportData) return;
    exportProfitReportExcel(reportData, currentPeriodLabel, config.name);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 text-slate-100">
      {/* 1. Header con Filtros de Período y Botón de Excel */}
      <div className="mb-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-white tracking-tight">
                Reporte de Ganancias & Rentabilidad
              </h2>
              <p className="text-xs text-slate-400">
                Ganancia neta calculada en tiempo real según costos de compra de cada venta.
              </p>
            </div>
          </div>
        </div>

        {/* Acciones: Excel y Actualizar */}
        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
          <button
            onClick={handleExportExcel}
            disabled={!reportData || reportData.sales.length === 0}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 border border-slate-700 transition-all cursor-pointer shadow-sm disabled:opacity-50"
            title="Descargar Reporte Completo de Ganancias en Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Descargar Informe Excel</span>
          </button>

          <button
            onClick={fetchReport}
            disabled={isLoading}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 border border-slate-700 transition-all cursor-pointer shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Selector de Rango de Fechas */}
      <div className="mb-6 p-3 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setPeriodPreset('today')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              periodPreset === 'today'
                ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            Hoy
          </button>
          <button
            onClick={() => setPeriodPreset('yesterday')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              periodPreset === 'yesterday'
                ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            Ayer
          </button>
          <button
            onClick={() => setPeriodPreset('week')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              periodPreset === 'week'
                ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            Últimos 7 Días
          </button>
          <button
            onClick={() => setPeriodPreset('month')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              periodPreset === 'month'
                ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            Este Mes
          </button>
          <button
            onClick={() => setPeriodPreset('custom')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              periodPreset === 'custom'
                ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            Personalizado
          </button>
        </div>

        {periodPreset === 'custom' && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-300">
              <span className="text-slate-500">Desde:</span>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-slate-500"
              />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-300">
              <span className="text-slate-500">Hasta:</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-slate-500"
              />
            </div>
          </div>
        )}

        <div className="text-xs text-slate-400 flex items-center gap-1.5 font-medium">
          <Calendar className="w-3.5 h-3.5 text-slate-500" />
          <span>{currentPeriodLabel}</span>
        </div>
      </div>

      {/* 2. Tarjetas Principales de Rentabilidad (KPIs) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 mb-6">
        {/* Total Ventas */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="text-xs text-slate-400 font-semibold mb-1 flex items-center justify-between">
              <span>Ingresos por Ventas</span>
              <Receipt className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-xl font-extrabold text-white">
              {formatCurrency(summary.totalSales)}
            </div>
          </div>
          <div className="mt-2 text-[11px] text-slate-400">
            {summary.salesCount} {summary.salesCount === 1 ? 'ticket' : 'tickets emitidos'}
          </div>
        </div>

        {/* Costo Mercadería */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="text-xs text-slate-400 font-semibold mb-1 flex items-center justify-between">
              <span>Costo de Mercadería</span>
              <Package className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-xl font-extrabold text-slate-300">
              {formatCurrency(summary.totalCost)}
            </div>
          </div>
          <div className="mt-2 text-[11px] text-slate-400">
            {summary.totalUnitsSold} unidades vendidas
          </div>
        </div>

        {/* Ganancia Bruta */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="text-xs text-slate-400 font-semibold mb-1 flex items-center justify-between">
              <span>Ganancia Bruta</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                  summary.grossProfit >= 0
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-rose-500/10 text-rose-400'
                }`}
              >
                {summary.grossProfit >= 0 ? `+${summary.grossMarginPct}%` : `${summary.grossMarginPct}%`}
              </span>
            </div>
            <div
              className={`text-xl font-extrabold ${
                summary.grossProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {summary.grossProfit > 0
                ? `+${formatCurrency(summary.grossProfit)}`
                : formatCurrency(summary.grossProfit)}
            </div>
          </div>
          <div className="mt-2 text-[11px] text-slate-400">
            Margen sobre costo
          </div>
        </div>

        {/* Gastos de Caja Menor */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="text-xs text-slate-400 font-semibold mb-1 flex items-center justify-between">
              <span>Gastos de Caja Menor</span>
              <Wallet className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-xl font-extrabold text-rose-400">
              -{formatCurrency(summary.totalExpenses)}
            </div>
          </div>
          <div className="mt-2 text-[11px] text-slate-400">
            {(reportData?.expenses || []).length} egresos de gaveta
          </div>
        </div>

        {/* Ganancia Neta Real */}
        <div
          className={`p-4 rounded-2xl bg-slate-900 border flex flex-col justify-between ${
            summary.netProfit >= 0
              ? 'border-emerald-500/30 bg-emerald-950/10'
              : 'border-rose-500/30 bg-rose-950/10'
          }`}
        >
          <div>
            <div
              className={`text-xs font-semibold mb-1 flex items-center justify-between ${
                summary.netProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'
              }`}
            >
              <span>{summary.netProfit >= 0 ? 'Ganancia Neta Real' : 'Pérdida Neta Real'}</span>
              {summary.netProfit >= 0 ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400" />
              )}
            </div>
            <div
              className={`text-xl font-extrabold ${
                summary.netProfit >= 0 ? 'text-emerald-300' : 'text-rose-400'
              }`}
            >
              {formatCurrency(summary.netProfit)}
            </div>
          </div>
          <div
            className={`mt-2 text-[11px] font-medium ${
              summary.netProfit >= 0 ? 'text-emerald-400/80' : 'text-rose-400/80'
            }`}
          >
            {summary.netProfit >= 0
              ? `Rentabilidad neta: +${summary.netMarginPct}%`
              : `Rentabilidad neta: ${summary.netMarginPct}% (Pérdida)`}
          </div>
        </div>
      </div>

      {/* 3. Desglose de Cobros por Método de Pago */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300 shrink-0">
            <Banknote className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] text-slate-400 truncate">Efectivo Puro</div>
            <div className="text-sm font-bold text-white">
              {formatCurrency(summary.paymentMethods.CASH || 0)}
            </div>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300 shrink-0">
            <QrCode className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] text-slate-400 truncate">Yape / Plin</div>
            <div className="text-sm font-bold text-white">
              {formatCurrency(summary.paymentMethods.TRANSFER || 0)}
            </div>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300 shrink-0">
            <CreditCard className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] text-slate-400 truncate">Tarjetas</div>
            <div className="text-sm font-bold text-white">
              {formatCurrency(summary.paymentMethods.CARD || 0)}
            </div>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300 shrink-0">
            <Layers className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] text-slate-400 truncate">Pagos Mixtos</div>
            <div className="text-sm font-bold text-white">
              {formatCurrency(summary.paymentMethods.MIXED || 0)}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Pestañas de Detalle y Buscador */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('products')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'products'
                  ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Package className="w-3.5 h-3.5 text-emerald-400" />
              <span>Productos Más Rentables</span>
              <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] text-slate-300">
                {reportData?.products.length || 0}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('sales')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'sales'
                  ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Receipt className="w-3.5 h-3.5 text-blue-400" />
              <span>Tickets y Ventas</span>
              <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] text-slate-300">
                {reportData?.sales.length || 0}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('expenses')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'expenses'
                  ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Wallet className="w-3.5 h-3.5 text-rose-400" />
              <span>Gastos de Caja</span>
              <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] text-slate-300">
                {reportData?.expenses.length || 0}
              </span>
            </button>
          </div>

          {/* Buscador */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={
                activeTab === 'products'
                  ? 'Buscar por nombre, código...'
                  : activeTab === 'sales'
                  ? 'Buscar ticket, cajero, cliente...'
                  : 'Buscar gasto...'
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-slate-500"
            />
          </div>
        </div>

        {/* TAB 1: PRODUCTOS MÁS RENTABLES */}
        {activeTab === 'products' && (
          <div className="overflow-x-auto rounded-2xl border border-slate-800 max-h-[620px] shadow-inner bg-slate-950/40">
            <table className="w-full min-w-[1100px] text-left text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-950 text-slate-400 border-b border-slate-800 font-semibold uppercase text-[10px] tracking-wider shadow-sm">
                <tr>
                  <th className="p-3.5 w-12 text-center">#</th>
                  <th className="p-3.5 w-72">Producto</th>
                  <th className="p-3.5 w-40">Categoría</th>
                  <th className="p-3.5 text-right w-32">Cant. Vendida</th>
                  <th className="p-3.5 text-right w-28">Costo Unit. Prom.</th>
                  <th className="p-3.5 text-right w-32">Venta Total</th>
                  <th className="p-3.5 text-right w-32">Costo Total</th>
                  <th className="p-3.5 text-right w-36">Ganancia Neta</th>
                  <th className="p-3.5 text-right w-24">Margen %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <div className="w-6 h-6 border-2 border-slate-700 border-t-emerald-400 rounded-full animate-spin" />
                        <span>Calculando utilidades y márgenes...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-10 text-center text-slate-400">
                      No se encontraron ventas de productos en este período.
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p, idx) => (
                    <tr key={p.productId} className="hover:bg-slate-800/50 transition-colors">
                      <td className="p-3.5 font-mono text-slate-500 text-[11px] text-center">{idx + 1}</td>
                      <td className="p-3.5">
                        <div className="font-semibold text-white">{p.productName}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {p.barcode || 'Sin código'}
                        </div>
                      </td>
                      <td className="p-3.5 text-slate-300">{p.categoryName}</td>
                      <td className="p-3.5 text-right font-semibold text-white whitespace-nowrap">
                        {p.quantitySold} <span className="text-[10px] text-slate-400 font-normal">{getUnitShortName(p.unitType as any)}</span>
                      </td>
                      <td className="p-3.5 text-right font-mono text-slate-300 whitespace-nowrap">
                        {formatCurrency(p.totalCost / (p.quantitySold || 1))}
                      </td>
                      <td className="p-3.5 text-right font-mono font-medium text-slate-200 whitespace-nowrap">
                        {formatCurrency(p.totalRevenue)}
                      </td>
                      <td className="p-3.5 text-right font-mono text-slate-400 whitespace-nowrap">
                        {formatCurrency(p.totalCost)}
                      </td>
                      <td className="p-3.5 text-right font-mono font-bold text-emerald-400 whitespace-nowrap">
                        +{formatCurrency(p.profit)}
                      </td>
                      <td className="p-3.5 text-right whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            p.marginPct >= 30
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20'
                              : p.marginPct >= 15
                              ? 'bg-blue-500/15 text-blue-300 border border-blue-500/20'
                              : 'bg-amber-500/15 text-amber-300 border border-amber-500/20'
                          }`}
                        >
                          {p.marginPct}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {filteredProducts.length > 0 && (
                <tfoot className="sticky bottom-0 z-10 bg-slate-950 border-t-2 border-slate-700 text-xs font-semibold text-slate-300 shadow-lg">
                  <tr>
                    <td colSpan={3} className="p-3.5 text-slate-400">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-bold">TOTALES PRODUCTOS:</span>
                        <span className="text-slate-400 text-[11px]">({filteredProducts.length} artículos vendidos)</span>
                      </div>
                    </td>
                    <td className="p-3.5 text-right font-mono font-bold text-white whitespace-nowrap">
                      {prodTotalQty}
                    </td>
                    <td className="p-3.5 text-right text-slate-600 font-mono">--</td>
                    <td className="p-3.5 text-right font-mono font-bold text-white whitespace-nowrap">
                      {formatCurrency(prodTotalRev)}
                    </td>
                    <td className="p-3.5 text-right font-mono font-bold text-slate-400 whitespace-nowrap">
                      {formatCurrency(prodTotalCost)}
                    </td>
                    <td className="p-3.5 text-right font-mono font-extrabold text-emerald-400 whitespace-nowrap">
                      +{formatCurrency(prodTotalProfit)}
                    </td>
                    <td className="p-3.5 text-right whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-bold text-[10px] border border-emerald-500/30">
                        +{prodAvgMargin}%
                      </span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* TAB 2: TICKETS Y VENTAS */}
        {activeTab === 'sales' && (
          <div className="overflow-x-auto rounded-2xl border border-slate-800 max-h-[620px] shadow-inner bg-slate-950/40">
            <table className="w-full min-w-[1100px] text-left text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-950 text-slate-400 border-b border-slate-800 font-semibold uppercase text-[10px] tracking-wider shadow-sm">
                <tr>
                  <th className="p-3.5 w-28">N° Ticket</th>
                  <th className="p-3.5 w-40">Fecha y Hora</th>
                  <th className="p-3.5 w-48">Caja / Cajero</th>
                  <th className="p-3.5 w-32">Método Pago</th>
                  <th className="p-3.5 text-right w-32">Total Venta</th>
                  <th className="p-3.5 text-right w-32">Costo Venta</th>
                  <th className="p-3.5 text-right w-36">Ganancia Ticket</th>
                  <th className="p-3.5 text-right w-24">Margen</th>
                  <th className="p-3.5 text-center w-24">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <div className="w-6 h-6 border-2 border-slate-700 border-t-emerald-400 rounded-full animate-spin" />
                        <span>Cargando tickets de venta...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredSales.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-10 text-center text-slate-400">
                      No se encontraron tickets registrados en este período.
                    </td>
                  </tr>
                ) : (
                  filteredSales.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="p-3.5 font-bold text-white font-mono whitespace-nowrap">#{s.saleNumber}</td>
                      <td className="p-3.5 text-slate-300 text-[11px] font-mono whitespace-nowrap">
                        <div className="font-semibold text-slate-200">{formatPeruTime(s.createdAt)}</div>
                        <div className="text-[10px] text-slate-500">{formatPeruDate(s.createdAt)}</div>
                      </td>
                      <td className="p-3.5 whitespace-nowrap">
                        <div className="text-white font-medium">{s.cashRegister}</div>
                        <div className="text-[10px] text-slate-400">{s.cashier}</div>
                      </td>
                      <td className="p-3.5 text-slate-300 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px]">
                          {s.paymentMethod === 'CASH' && 'Efectivo'}
                          {s.paymentMethod === 'TRANSFER' && 'Yape/Plin'}
                          {s.paymentMethod === 'CARD' && 'Tarjeta'}
                          {s.paymentMethod === 'MIXED' && 'Pago Mixto'}
                        </span>
                      </td>
                      <td className="p-3.5 text-right font-mono font-bold text-white whitespace-nowrap">
                        {formatCurrency(s.totalAmount)}
                      </td>
                      <td className="p-3.5 text-right font-mono text-slate-400 whitespace-nowrap">
                        {formatCurrency(s.totalCost)}
                      </td>
                      <td className="p-3.5 text-right font-mono font-bold text-emerald-400 whitespace-nowrap">
                        +{formatCurrency(s.profit)}
                      </td>
                      <td className="p-3.5 text-right whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">
                          {s.marginPct}%
                        </span>
                      </td>
                      <td className="p-3.5 text-center whitespace-nowrap">
                        <button
                          onClick={() => setSelectedSale(s)}
                          className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-semibold border border-slate-700 transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-sm"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Ver</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {filteredSales.length > 0 && (
                <tfoot className="sticky bottom-0 z-10 bg-slate-950 border-t-2 border-slate-700 text-xs font-semibold text-slate-300 shadow-lg">
                  <tr>
                    <td colSpan={4} className="p-3.5 text-slate-400">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-bold">TOTALES TICKETS:</span>
                        <span className="text-slate-400 text-[11px]">({filteredSales.length} ventas emitidas)</span>
                      </div>
                    </td>
                    <td className="p-3.5 text-right font-mono font-bold text-white whitespace-nowrap">
                      {formatCurrency(salesTotalRev)}
                    </td>
                    <td className="p-3.5 text-right font-mono font-bold text-slate-400 whitespace-nowrap">
                      {formatCurrency(salesTotalCost)}
                    </td>
                    <td className="p-3.5 text-right font-mono font-extrabold text-emerald-400 whitespace-nowrap">
                      +{formatCurrency(salesTotalProfit)}
                    </td>
                    <td className="p-3.5 text-right whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-bold text-[10px] border border-emerald-500/30">
                        +{salesAvgMargin}%
                      </span>
                    </td>
                    <td className="p-3.5 text-center text-slate-600">--</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* TAB 3: GASTOS DE CAJA MENOR */}
        {activeTab === 'expenses' && (
          <div className="overflow-x-auto rounded-2xl border border-slate-800 max-h-[620px] shadow-inner bg-slate-950/40">
            <table className="w-full min-w-[900px] text-left text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-950 text-slate-400 border-b border-slate-800 font-semibold uppercase text-[10px] tracking-wider shadow-sm">
                <tr>
                  <th className="p-3.5 w-44">Fecha y Hora</th>
                  <th className="p-3.5 w-40">Caja</th>
                  <th className="p-3.5 w-44">Responsable</th>
                  <th className="p-3.5">Motivo / Concepto del Gasto</th>
                  <th className="p-3.5 text-right w-40">Monto Egresado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <div className="w-6 h-6 border-2 border-slate-700 border-t-emerald-400 rounded-full animate-spin" />
                        <span>Cargando movimientos de gastos...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-slate-400">
                      No se registraron egresos o gastos de caja con el filtro aplicado.
                    </td>
                  </tr>
                ) : (
                  filteredExpenses.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="p-3.5 text-slate-300 text-[11px] font-mono whitespace-nowrap">
                        <div className="font-semibold text-slate-200">{formatPeruTime(e.createdAt)}</div>
                        <div className="text-[10px] text-slate-500">{formatPeruDate(e.createdAt)}</div>
                      </td>
                      <td className="p-3.5 text-white font-medium whitespace-nowrap">{e.cashRegister}</td>
                      <td className="p-3.5 text-slate-300 whitespace-nowrap">{e.cashier}</td>
                      <td className="p-3.5 text-slate-200">{e.reason}</td>
                      <td className="p-3.5 text-right font-mono font-bold text-rose-400 whitespace-nowrap">
                        -{formatCurrency(e.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {filteredExpenses.length > 0 && (
                <tfoot className="sticky bottom-0 z-10 bg-slate-950 border-t-2 border-slate-700 text-xs font-semibold text-slate-300 shadow-lg">
                  <tr>
                    <td colSpan={4} className="p-3.5 text-slate-400">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-bold">TOTAL GASTOS DE CAJA:</span>
                        <span className="text-slate-400 text-[11px]">({filteredExpenses.length} egresos de gaveta)</span>
                      </div>
                    </td>
                    <td className="p-3.5 text-right font-mono font-extrabold text-rose-400 whitespace-nowrap">
                      -{formatCurrency(expensesTotalAmount)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* MODAL DETALLE DE TICKET CON COSTOS Y GANANCIAS */}
      {selectedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-5 max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">
                  Detalle del Ticket #{selectedSale.saleNumber}
                </h3>
              </div>
              <button
                onClick={() => setSelectedSale(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs border-b border-slate-800/60 text-slate-300">
              <div>
                <span className="text-slate-500 block text-[10px]">Cajero / Caja</span>
                <span className="font-semibold text-white">{selectedSale.cashier} ({selectedSale.cashRegister})</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Cliente</span>
                <span className="font-semibold text-white">{selectedSale.customerName || 'Varios'}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Método</span>
                <span className="font-semibold text-white">{selectedSale.paymentMethod}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Fecha</span>
                <span className="font-semibold text-white">
                  {formatPeruTime(selectedSale.createdAt)}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto py-3">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px]">
                  <tr>
                    <th className="p-2">Producto</th>
                    <th className="p-2 text-center">Cant.</th>
                    <th className="p-2 text-right">P. Venta</th>
                    <th className="p-2 text-right">Costo Unit.</th>
                    <th className="p-2 text-right">Subtotal</th>
                    <th className="p-2 text-right">Ganancia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {selectedSale.items.map((item) => (
                    <tr key={item.id}>
                      <td className="p-2 font-medium text-white">{item.productName}</td>
                      <td className="p-2 text-center font-semibold">{item.quantity}</td>
                      <td className="p-2 text-right font-mono text-slate-300">{formatCurrency(item.unitPrice)}</td>
                      <td className="p-2 text-right font-mono text-slate-400">{formatCurrency(item.costPrice)}</td>
                      <td className="p-2 text-right font-mono font-medium text-slate-200">{formatCurrency(item.subtotal)}</td>
                      <td className="p-2 text-right font-mono font-bold text-emerald-400">+{formatCurrency(item.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-between bg-slate-950/40 p-3 rounded-xl">
              <div className="flex items-center gap-4 text-xs">
                <div>
                  <span className="text-slate-500 block text-[10px]">Costo Total:</span>
                  <span className="font-mono text-slate-400 font-semibold">{formatCurrency(selectedSale.totalCost)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Ganancia Neta:</span>
                  <span className="font-mono text-emerald-400 font-bold">+{formatCurrency(selectedSale.profit)} ({selectedSale.marginPct}%)</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-slate-400 text-xs block">Total Cobrado</span>
                <span className="text-lg font-extrabold text-white font-mono">{formatCurrency(selectedSale.totalAmount)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
