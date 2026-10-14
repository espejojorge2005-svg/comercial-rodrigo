import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest, downloadReportBlob } from '../../api/client.js';
import {
  formatCurrency,
  formatPeruDate,
  formatPeruTime,
  getPeruYMD,
} from '../../lib/utils.js';
import type { TaxBookResponse, ManagementReportResponse } from '../../types/index.js';
import {
  TrendingUp,
  Package,
  Receipt,
  FileSpreadsheet,
  RefreshCw,
  Search,
  Wallet,
  Calendar,
  Eye,
  X,
  Banknote,
  Briefcase,
  Scale,
  Building2,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  AlertCircle,
  Layers,
} from 'lucide-react';

export const ProfitReportView: React.FC = () => {
  // Segmentación Principal: 'management' (Dueña) vs 'tax' (Contador)
  const [reportMode, setReportMode] = useState<'management' | 'tax'>('management');

  // Filtro de Rango de Fechas
  const [periodPreset, setPeriodPreset] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('today');
  const initialTodayYMD = getPeruYMD();
  const [customStart, setCustomStart] = useState<string>(initialTodayYMD);
  const [customEnd, setCustomEnd] = useState<string>(initialTodayYMD);

  // Estados de datos
  const [managementData, setManagementData] = useState<ManagementReportResponse | null>(null);
  const [taxData, setTaxData] = useState<TaxBookResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  // Sub-pestañas para reporte gerencial
  const [managementTab, setManagementTab] = useState<'sales' | 'expenses'>('sales');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedSale, setSelectedSale] = useState<any | null>(null);

  // Turnos para filtrado específico
  const [shiftsList, setShiftsList] = useState<any[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState<string>('all');

  useEffect(() => {
    apiRequest<any[]>('/cash-shifts/history')
      .then((data) => setShiftsList(data || []))
      .catch((err) => console.error('Error cargando historial de turnos:', err));
  }, []);

  // Calcula rango ISO con offset -05:00 de Perú
  const getDateRangeParams = useCallback(() => {
    const todayYMD = getPeruYMD();
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

  // Carga de datos según modo activo
  const fetchReport = useCallback(async () => {
    setIsLoading(true);
    try {
      const { startDate, endDate } = getDateRangeParams();
      const params = new URLSearchParams();

      if (selectedShiftId !== 'all') {
        params.append('shiftId', selectedShiftId);
      } else {
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
      }

      if (reportMode === 'management') {
        const res = await apiRequest<ManagementReportResponse>(`/reports/management?${params.toString()}`);
        setManagementData(res);
      } else {
        const res = await apiRequest<TaxBookResponse>(`/reports/tax-book?${params.toString()}`);
        setTaxData(res);
      }
    } catch (err) {
      console.error('Error al cargar reporte:', err);
    } finally {
      setIsLoading(false);
    }
  }, [reportMode, getDateRangeParams, selectedShiftId]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const { label: currentPeriodLabel } = getDateRangeParams();

  // Descarga en Excel usando ExcelJS desde el Backend
  const handleExportExcel = async () => {
    setIsDownloading(true);
    try {
      const { startDate, endDate } = getDateRangeParams();
      const params = new URLSearchParams();

      if (selectedShiftId !== 'all') {
        params.append('shiftId', selectedShiftId);
      } else {
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
      }

      if (reportMode === 'management') {
        await downloadReportBlob(
          `/reports/management/excel?${params.toString()}`,
          `Reporte_Gerencial_Rodrigo_${getPeruYMD()}.xlsx`,
        );
      } else {
        await downloadReportBlob(
          `/reports/tax-book/excel?${params.toString()}`,
          `Libro_Ventas_SUNAT_${getPeruYMD()}.xlsx`,
        );
      }
    } catch (err: any) {
      alert(`Error descargando reporte Excel: ${err.message || err}`);
    } finally {
      setIsDownloading(false);
    }
  };

  // Filtrado de ventas del reporte gerencial
  const filteredManagementSales = (managementData?.salesDetail || []).filter((s: any) => {
    const q = searchTerm.toLowerCase();
    return (
      s.saleNumber.toString().includes(q) ||
      (s.fullReceiptNumber && s.fullReceiptNumber.toLowerCase().includes(q)) ||
      (s.customerName && s.customerName.toLowerCase().includes(q)) ||
      (s.customerDocument && s.customerDocument.includes(q)) ||
      s.cashier.toLowerCase().includes(q) ||
      s.cashRegister.toLowerCase().includes(q)
    );
  });

  // Filtrado de gastos de caja chica
  const filteredExpenses = (managementData?.cashMovementsDetail || []).filter((e: any) => {
    const q = searchTerm.toLowerCase();
    return (
      e.reason.toLowerCase().includes(q) ||
      e.cashier.toLowerCase().includes(q) ||
      e.cashRegister.toLowerCase().includes(q)
    );
  });

  // Filtrado del Libro Tributario
  const filteredTaxRecords = (taxData?.records || []).filter((r) => {
    const q = searchTerm.toLowerCase();
    return (
      r.fullReceiptNumber.toLowerCase().includes(q) ||
      r.customerDocument.includes(q) ||
      r.customerName.toLowerCase().includes(q) ||
      r.series.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
      {/* 1. Encabezado Principal y Segmentación Integrada */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 mb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Building2 className="w-4.5 h-4.5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Reportes y Contabilidad
              </h1>
              <p className="text-xs text-slate-400 font-medium">
                {reportMode === 'management'
                  ? 'Vista Gerencial: 100% de ventas (Notas + Boletas + Facturas), costos y arqueo de caja física'
                  : 'Vista Tributaria: Libro oficial SUNAT / RVIE para contabilidad (Boletas y Facturas)'}
              </p>
            </div>
          </div>
        </div>

        {/* Selector Segmentado de Modo + Acciones */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Segmented Control Pill */}
          <div className="bg-slate-900 p-1 rounded-xl border border-slate-800 flex items-center gap-1 shadow-inner">
            <button
              onClick={() => setReportMode('management')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                reportMode === 'management'
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>Gerencial (100%)</span>
            </button>

            <button
              onClick={() => setReportMode('tax')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                reportMode === 'tax'
                  ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              <Scale className="w-3.5 h-3.5" />
              <span>Libro SUNAT</span>
            </button>
          </div>

          {/* Descarga Excel */}
          <button
            onClick={handleExportExcel}
            disabled={isDownloading || isLoading}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-md disabled:opacity-50 ${
              reportMode === 'management'
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-950/40'
            }`}
            title="Descargar libro en Excel con formato y fórmulas oficiales"
          >
            <FileSpreadsheet className={`w-3.5 h-3.5 ${isDownloading ? 'animate-bounce' : ''}`} />
            <span>{isDownloading ? 'Generando...' : 'Descargar Excel'}</span>
          </button>

          {/* Actualizar */}
          <button
            onClick={fetchReport}
            disabled={isLoading}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white text-xs font-semibold border border-slate-800 transition-all cursor-pointer shadow-sm"
            title="Actualizar datos"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. Barra de Filtros y Rango de Fechas */}
      <div className="mb-4 p-2.5 sm:p-3 rounded-2xl bg-slate-900/90 border border-slate-800/80 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-1">
          {(['today', 'yesterday', 'week', 'month', 'custom'] as const).map((preset) => {
            const labels: Record<string, string> = {
              today: 'Hoy',
              yesterday: 'Ayer',
              week: '7 Días',
              month: 'Este Mes',
              custom: 'Personalizado',
            };
            return (
              <button
                key={preset}
                onClick={() => setPeriodPreset(preset)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  periodPreset === preset
                    ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                {labels[preset]}
              </button>
            );
          })}
        </div>

        {periodPreset === 'custom' && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-slate-300">
              <span className="text-slate-500">Desde:</span>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex items-center gap-1 text-xs text-slate-300">
              <span className="text-slate-500">Hasta:</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Selector de Turno de Caja */}
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            <select
              value={selectedShiftId}
              onChange={(e) => setSelectedShiftId(e.target.value)}
              className="bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 outline-none max-w-[210px] truncate cursor-pointer"
            >
              <option value="all">Todos los turnos</option>
              {shiftsList.slice(0, 15).map((s) => {
                const dateStr = s.closedAt ? formatPeruDate(s.closedAt) : formatPeruDate(s.openedAt);
                const isOpen = s.status === 'OPEN';
                const cashier = (s.user?.name || 'Cajero').replace(/\s*\(.*?\)\s*/g, '').trim();
                const box = s.cashRegister?.name || 'Caja';
                return (
                  <option key={s.id} value={s.id}>
                    {isOpen ? '🟢 ' : ''}{box} · {cashier} {isOpen ? '(Abierto)' : `(${dateStr})`}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="text-xs text-slate-400 flex items-center gap-1 font-medium bg-slate-950/60 px-2.5 py-1 rounded-lg border border-slate-800/60">
            <Calendar className="w-3.5 h-3.5 text-indigo-400" />
            <span>{selectedShiftId !== 'all' ? 'Turno filtrado' : currentPeriodLabel}</span>
          </div>
        </div>
      </div>

      {/* Notificación Compacta cuando no hay ventas en 'Hoy' */}
      {selectedShiftId === 'all' && periodPreset === 'today' && ((reportMode === 'management' && managementData?.summary.totalGrossRevenue === 0) || (reportMode === 'tax' && taxData?.summary.totalAmount === 0)) && (
        <div className="mb-4 px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25 flex flex-wrap items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-2 text-amber-300 font-medium">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>Sin ventas emitidas hoy ({formatPeruDate(new Date())}). Si operaste de madrugada, las ventas corresponden a su día de emisión:</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setPeriodPreset('week')}
              className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-bold text-[11px] transition-all cursor-pointer"
            >
              Ver 7 Días
            </button>
            <button
              onClick={() => setPeriodPreset('month')}
              className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 font-bold text-[11px] transition-all cursor-pointer"
            >
              Ver Este Mes
            </button>
            {shiftsList.length > 0 && (
              <button
                onClick={() => setSelectedShiftId(shiftsList[0].id)}
                className="px-2.5 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 font-bold text-[11px] transition-all cursor-pointer"
              >
                Último Turno
              </button>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* VISTA A: REPORTE OPERATIVO Y GERENCIAL (PARA LA DUEÑA)              */}
      {/* =================================================================== */}
      {reportMode === 'management' && (
        <div className="space-y-4">

          {/* Tarjetas KPIs Principales */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            {/* Ingresos Totales (100%) */}
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
              <div>
                <div className="text-xs text-slate-400 font-semibold mb-1 flex items-center justify-between">
                  <span>Ingresos Totales (100%)</span>
                  <Receipt className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-xl font-black text-white">
                  {formatCurrency(managementData?.summary.totalGrossRevenue || 0)}
                </div>
              </div>
              <div className="mt-2 text-[11px] text-slate-400">
                {managementData?.summary.salesCount || 0} ventas registradas
              </div>
            </div>

            {/* Costo Mercadería (COGS) */}
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
              <div>
                <div className="text-xs text-slate-400 font-semibold mb-1 flex items-center justify-between">
                  <span>Costo Mercadería (COGS)</span>
                  <Package className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-xl font-black text-amber-400">
                  {formatCurrency(managementData?.summary.totalCogs || 0)}
                </div>
              </div>
              <div className="mt-2 text-[11px] text-slate-400">
                {managementData?.summary.totalUnitsSold || 0} unidades vendidas
              </div>
            </div>

            {/* Ganancia Bruta Real */}
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
              <div>
                <div className="text-xs text-slate-400 font-semibold mb-1 flex items-center justify-between">
                  <span>Ganancia Bruta Real</span>
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-xl font-black text-emerald-400">
                  {formatCurrency(managementData?.summary.grossProfit || 0)}
                </div>
              </div>
              <div className="mt-2 text-[11px] text-emerald-400/90 font-medium">
                Margen Bruto: {managementData?.summary.grossMarginPct || 0}%
              </div>
            </div>

            {/* Salidas de Caja Chica */}
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
              <div>
                <div className="text-xs text-slate-400 font-semibold mb-1 flex items-center justify-between">
                  <span>Gastos de Caja Chica</span>
                  <ArrowDownRight className="w-4 h-4 text-rose-400" />
                </div>
                <div className="text-xl font-black text-rose-400">
                  -{formatCurrency(managementData?.summary.totalExpenses || 0)}
                </div>
              </div>
              <div className="mt-2 text-[11px] text-slate-400">
                Salidas directas de efectivo
              </div>
            </div>

            {/* Ganancia Neta Real */}
            <div className="p-4 rounded-2xl bg-slate-900 border border-emerald-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/20 flex flex-col justify-between">
              <div>
                <div className="text-xs text-emerald-400 font-bold mb-1 flex items-center justify-between">
                  <span>Ganancia Neta Real</span>
                  <Wallet className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-xl font-black text-emerald-300">
                  {formatCurrency(managementData?.summary.netProfit || 0)}
                </div>
              </div>
              <div className="mt-2 text-[11px] text-emerald-300/90 font-semibold">
                Margen Neto: {managementData?.summary.netMarginPct || 0}%
              </div>
            </div>
          </div>

          {/* Panel de Cuadre Total en Gaveta Física y Comprobantes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Cuadre de Gaveta Física */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
              <div className="flex items-center gap-2 mb-3">
                <Banknote className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-extrabold text-white">
                  Cuadre Total de Dinero en Gaveta Física (Efectivo)
                </h3>
              </div>
              <p className="text-xs text-slate-400 mb-4">
                Conciliación del efectivo que debe existir físicamente en las cajas registradoras.
              </p>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center py-1.5 border-b border-slate-800 text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
                    (+) Efectivo Real Cobrado por Ventas
                  </span>
                  <span className="font-bold text-white">
                    {formatCurrency(managementData?.summary.cashPaidTotal || 0)}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-slate-800 text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
                    (+) Entradas adicionales a Caja Chica
                  </span>
                  <span className="font-bold text-emerald-400">
                    +{formatCurrency(managementData?.summary.totalIncomes || 0)}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-slate-800 text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" />
                    (-) Salidas / Gastos de Caja Chica
                  </span>
                  <span className="font-bold text-rose-400">
                    -{formatCurrency(managementData?.summary.totalExpenses || 0)}
                  </span>
                </div>

                <div className="flex justify-between items-center pt-3 text-sm font-extrabold text-white bg-emerald-950/30 p-3 rounded-xl border border-emerald-500/20">
                  <span className="text-emerald-300">(=) EFECTIVO ESPERADO EN GAVETA FÍSICA:</span>
                  <span className="text-base text-emerald-400 font-black">
                    {formatCurrency(managementData?.summary.theoreticalDrawerCash || 0)}
                  </span>
                </div>
              </div>
            </div>

            {/* Desglose por Tipo de Comprobante */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
              <div className="flex items-center gap-2 mb-3">
                <Receipt className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-extrabold text-white">
                  Desglose de Ingresos por Tipo de Comprobante
                </h3>
              </div>
              <p className="text-xs text-slate-400 mb-4">
                Participación porcentual y rentabilidad según el comprobante emitido.
              </p>

              <div className="space-y-3">
                {/* Nota de Venta */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">Notas de Venta (Internas)</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold">
                        {managementData?.summary.receiptTypeSummary.notaVenta.count || 0} emitidas
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Participación: {managementData?.summary.receiptTypeSummary.notaVenta.sharePct || 0}% de los ingresos
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-extrabold text-white">
                      {formatCurrency(managementData?.summary.receiptTypeSummary.notaVenta.total || 0)}
                    </div>
                    <div className="text-[10px] text-emerald-400 font-medium">
                      Ganancia: {formatCurrency(managementData?.summary.receiptTypeSummary.notaVenta.profit || 0)}
                    </div>
                  </div>
                </div>

                {/* Boleta Electrónica */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-blue-300">Boletas de Venta</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950 border border-blue-800 text-blue-300 font-semibold">
                        {managementData?.summary.receiptTypeSummary.boleta.count || 0} emitidas
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Participación: {managementData?.summary.receiptTypeSummary.boleta.sharePct || 0}% de los ingresos
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-extrabold text-blue-200">
                      {formatCurrency(managementData?.summary.receiptTypeSummary.boleta.total || 0)}
                    </div>
                    <div className="text-[10px] text-emerald-400 font-medium">
                      Ganancia: {formatCurrency(managementData?.summary.receiptTypeSummary.boleta.profit || 0)}
                    </div>
                  </div>
                </div>

                {/* Factura Electrónica */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-amber-300">Facturas Electrónicas</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950 border border-amber-800 text-amber-300 font-semibold">
                        {managementData?.summary.receiptTypeSummary.factura.count || 0} emitidas
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Participación: {managementData?.summary.receiptTypeSummary.factura.sharePct || 0}% de los ingresos
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-extrabold text-amber-200">
                      {formatCurrency(managementData?.summary.receiptTypeSummary.factura.total || 0)}
                    </div>
                    <div className="text-[10px] text-emerald-400 font-medium">
                      Ganancia: {formatCurrency(managementData?.summary.receiptTypeSummary.factura.profit || 0)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sub-pestañas: Detalle 100% Ventas vs Gastos Caja Chica */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setManagementTab('sales')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    managementTab === 'sales'
                      ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Detalle Todas las Ventas ({filteredManagementSales.length})
                </button>
                <button
                  onClick={() => setManagementTab('expenses')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    managementTab === 'expenses'
                      ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Movimientos Caja Chica ({filteredExpenses.length})
                </button>
              </div>

              {/* Buscador */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar venta, cliente, motivo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* TABLA DE VENTAS CONSOLIDADAS (100%) */}
            {managementTab === 'sales' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/60 text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Comprobante</th>
                      <th className="py-2.5 px-3">Fecha/Hora</th>
                      <th className="py-2.5 px-3">Cliente</th>
                      <th className="py-2.5 px-3">Medio Pago</th>
                      <th className="py-2.5 px-3 text-right">Venta Total</th>
                      <th className="py-2.5 px-3 text-right">Costo Merc.</th>
                      <th className="py-2.5 px-3 text-right">Ganancia Real</th>
                      <th className="py-2.5 px-3 text-right">Margen</th>
                      <th className="py-2.5 px-3 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredManagementSales.map((sale: any) => (
                      <tr key={sale.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-bold text-white flex items-center gap-1.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              sale.receiptType === 'FACTURA'
                                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                : sale.receiptType === 'BOLETA'
                                  ? 'bg-blue-950 text-blue-300 border border-blue-800'
                                  : 'bg-slate-800 text-slate-300 border border-slate-700'
                            }`}
                          >
                            {sale.receiptType === 'FACTURA' ? 'FAC' : sale.receiptType === 'BOLETA' ? 'BOL' : 'N/V'}
                          </span>
                          <span>{sale.fullReceiptNumber}</span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-400">
                          {formatPeruDate(new Date(sale.createdAt))} {formatPeruTime(new Date(sale.createdAt))}
                        </td>
                        <td className="py-2.5 px-3 text-slate-200">
                          {sale.customerName}
                          {sale.customerDocument && sale.customerDocument !== '-' && (
                            <span className="block text-[10px] text-slate-500 font-mono">
                              Doc: {sale.customerDocument}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400">
                          {sale.paymentMethod}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-white">
                          {formatCurrency(sale.totalAmount)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-amber-400">
                          {formatCurrency(sale.totalCost)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-400">
                          {formatCurrency(sale.profit)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-slate-300">
                          {sale.marginPct}%
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            onClick={() => setSelectedSale(sale)}
                            className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                            title="Ver ítems y costos"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredManagementSales.length === 0 && (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-500">
                          No se encontraron ventas para el periodo seleccionado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* TABLA DE GASTOS Y ENTRADAS DE CAJA CHICA */}
            {managementTab === 'expenses' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/60 text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Fecha/Hora</th>
                      <th className="py-2.5 px-3">Tipo</th>
                      <th className="py-2.5 px-3">Motivo / Concepto</th>
                      <th className="py-2.5 px-3">Caja / Cajero</th>
                      <th className="py-2.5 px-3 text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredExpenses.map((m: any) => (
                      <tr key={m.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-2.5 px-3 text-slate-400">
                          {formatPeruDate(new Date(m.createdAt))} {formatPeruTime(new Date(m.createdAt))}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              m.type === 'EXPENSE'
                                ? 'bg-rose-950 border border-rose-800 text-rose-300'
                                : 'bg-emerald-950 border border-emerald-800 text-emerald-300'
                            }`}
                          >
                            {m.type === 'EXPENSE' ? 'SALIDA (GASTO)' : 'ENTRADA'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-200 font-medium">
                          {m.reason}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400">
                          {m.cashier} ({m.cashRegister})
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right font-bold ${
                            m.type === 'EXPENSE' ? 'text-rose-400' : 'text-emerald-400'
                          }`}
                        >
                          {m.type === 'EXPENSE' ? '-' : '+'}
                          {formatCurrency(m.amount)}
                        </td>
                      </tr>
                    ))}
                    {filteredExpenses.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500">
                          No se registraron movimientos de caja chica en este periodo.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* VISTA B: LIBRO TRIBUTARIO (PARA EL CONTADOR)                        */}
      {/* =================================================================== */}
      {reportMode === 'tax' && (
        <div className="space-y-4">
          {/* Tarjetas de Resumen Tributario */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            {/* Base Imponible Total */}
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
              <div>
                <div className="text-xs text-slate-400 font-semibold mb-1 flex items-center justify-between">
                  <span>Op. Gravada (Base Imponible)</span>
                  <FileText className="w-4 h-4 text-blue-400" />
                </div>
                <div className="text-xl font-black text-white">
                  {formatCurrency(taxData?.summary.totalTaxableBase || 0)}
                </div>
              </div>
              <div className="mt-2 text-[11px] text-slate-400">
                Suma antes del 18% de IGV
              </div>
            </div>

            {/* Total IGV Facturado */}
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
              <div>
                <div className="text-xs text-slate-400 font-semibold mb-1 flex items-center justify-between">
                  <span>Total IGV (18%)</span>
                  <Scale className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="text-xl font-black text-indigo-400">
                  {formatCurrency(taxData?.summary.totalIgv || 0)}
                </div>
              </div>
              <div className="mt-2 text-[11px] text-slate-400">
                Débito fiscal para declaración
              </div>
            </div>

            {/* Total Facturado Fiscal */}
            <div className="p-4 rounded-2xl bg-slate-900 border border-blue-500/30 flex flex-col justify-between">
              <div>
                <div className="text-xs text-blue-400 font-bold mb-1 flex items-center justify-between">
                  <span>Total Comprobantes Fiscales</span>
                  <Receipt className="w-4 h-4 text-blue-400" />
                </div>
                <div className="text-xl font-black text-blue-300">
                  {formatCurrency(taxData?.summary.totalAmount || 0)}
                </div>
              </div>
              <div className="mt-2 text-[11px] text-blue-300/80 font-medium">
                {taxData?.summary.totalFiscalSales || 0} comprobantes SUNAT
              </div>
            </div>

            {/* Boletas Emitidas (03) */}
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
              <div>
                <div className="text-xs text-slate-400 font-semibold mb-1 flex items-center justify-between">
                  <span>Boletas Emitidas (03)</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
                    B001 / B002
                  </span>
                </div>
                <div className="text-xl font-black text-white">
                  {taxData?.summary.receiptCount || 0}
                </div>
              </div>
              <div className="mt-2 text-[11px] text-slate-400">
                Clientes finales / minoristas
              </div>
            </div>

            {/* Facturas Emitidas (01) */}
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
              <div>
                <div className="text-xs text-slate-400 font-semibold mb-1 flex items-center justify-between">
                  <span>Facturas Emitidas (01)</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                    F001 / F002
                  </span>
                </div>
                <div className="text-xl font-black text-white">
                  {taxData?.summary.invoiceCount || 0}
                </div>
              </div>
              <div className="mt-2 text-[11px] text-slate-400">
                Empresas con RUC 11 dígitos
              </div>
            </div>
          </div>

          {/* Tabla Oficial de Registro de Ventas */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-extrabold text-white">
                  Registro de Ventas e Ingresos (Detalle para Declaración)
                </h3>
                <p className="text-xs text-slate-400">
                  Visualización previa de las columnas exactas que exporta el archivo Excel.
                </p>
              </div>

              {/* Buscador */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar RUC, DNI, serie o cliente..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 text-center">N°</th>
                    <th className="py-2.5 px-3 text-center">Fecha Emisión</th>
                    <th className="py-2.5 px-3 text-center">Tipo</th>
                    <th className="py-2.5 px-3 text-center">Serie</th>
                    <th className="py-2.5 px-3 text-center">Correlativo</th>
                    <th className="py-2.5 px-3 text-center">Tipo Doc.</th>
                    <th className="py-2.5 px-3 text-center">N° Documento</th>
                    <th className="py-2.5 px-3">Razón Social / Cliente</th>
                    <th className="py-2.5 px-3 text-right">Base Imponible</th>
                    <th className="py-2.5 px-3 text-right">IGV (18%)</th>
                    <th className="py-2.5 px-3 text-right">Importe Total</th>
                    <th className="py-2.5 px-3 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {filteredTaxRecords.map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-2.5 px-3 text-center text-slate-400">{rec.itemNumber}</td>
                      <td className="py-2.5 px-3 text-center text-slate-300">{rec.issueDate}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            rec.sunatDocTypeCode === '01'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : 'bg-blue-950 text-blue-300 border border-blue-800'
                          }`}
                        >
                          {rec.sunatDocTypeCode} ({rec.sunatDocTypeCode === '01' ? 'FAC' : 'BOL'})
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold text-white">{rec.series}</td>
                      <td className="py-2.5 px-3 text-center text-slate-300">{rec.formattedCorrelative}</td>
                      <td className="py-2.5 px-3 text-center text-slate-400 font-bold">
                        {rec.customerDocType === '6' ? '6 (RUC)' : rec.customerDocType === '1' ? '1 (DNI)' : '0 (S/D)'}
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-200">{rec.customerDocument}</td>
                      <td className="py-2.5 px-3 font-sans font-medium text-slate-100 max-w-xs truncate">
                        {rec.customerName}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-300 font-sans">
                        {formatCurrency(rec.taxableBase)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-indigo-400 font-sans">
                        {formatCurrency(rec.igvAmount)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-white font-sans">
                        {formatCurrency(rec.totalAmount)}
                      </td>
                      <td className="py-2.5 px-3 text-center font-sans">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                          {rec.emissionStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filteredTaxRecords.length === 0 && (
                    <tr>
                      <td colSpan={12} className="py-12 text-center text-slate-500 font-sans">
                        <div className="max-w-md mx-auto space-y-1">
                          <p className="font-semibold text-slate-400">
                            No se encontraron comprobantes fiscales (Boletas o Facturas) en este periodo.
                          </p>
                          <p className="text-xs text-slate-500">
                            (Las Notas de Venta internas no se muestran aquí por norma tributaria).
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>

                {/* Fila de Totales Generales */}
                {filteredTaxRecords.length > 0 && (
                  <tfoot className="bg-slate-950 text-white font-bold border-t-2 border-slate-700">
                    <tr>
                      <td colSpan={8} className="py-3 px-3 text-right font-sans">
                        TOTALES GENERALES DEL PERIODO:
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-200">
                        {formatCurrency(taxData?.summary.totalTaxableBase || 0)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-indigo-400">
                        {formatCurrency(taxData?.summary.totalIgv || 0)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-emerald-400 text-sm">
                        {formatCurrency(taxData?.summary.totalAmount || 0)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DETALLE DE ÍTEMS DE LA VENTA (Para vista gerencial) */}
      {selectedSale && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">
                  Detalle de Venta #{selectedSale.saleNumber} ({selectedSale.fullReceiptNumber})
                </h3>
                <p className="text-xs text-slate-400">
                  Cliente: {selectedSale.customerName} | Cajero: {selectedSale.cashier}
                </p>
              </div>
              <button
                onClick={() => setSelectedSale(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-2">
              {selectedSale.items?.map((item: any) => (
                <div key={item.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                  <div className="flex justify-between font-bold text-white mb-1">
                    <span>{item.productName}</span>
                    <span>{formatCurrency(item.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400 text-[11px]">
                    <span>
                      Cant: {item.quantity} x {formatCurrency(item.unitPrice)}
                    </span>
                    <span className="text-amber-400">
                      Costo: {formatCurrency(item.itemCost)}
                    </span>
                  </div>
                  <div className="flex justify-between text-emerald-400 text-[11px] font-semibold mt-1 pt-1 border-t border-slate-800/60">
                    <span>Ganancia del ítem:</span>
                    <span>+{formatCurrency(item.profit)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-xs">
              <span className="text-slate-400">Ganancia Total Venta:</span>
              <span className="text-sm font-extrabold text-emerald-400">
                +{formatCurrency(selectedSale.profit)} ({selectedSale.marginPct}%)
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
