import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest, downloadReportBlob } from '../../api/client.js';
import { toast } from '../../store/useToastStore.js';
import {
  formatCurrency,
  formatPeruDate,
  formatPeruTime,
  getPeruYMD,
  sanitizeExternalUrl,
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
  Download,
} from 'lucide-react';

let cachedManagementData: ManagementReportResponse | null = null;
let cachedTaxData: TaxBookResponse | null = null;
let cachedShiftsDropdown: any[] = [];

if (typeof window !== 'undefined') {
  window.addEventListener('cr:auth-changed', () => {
    cachedManagementData = null;
    cachedTaxData = null;
    cachedShiftsDropdown = [];
  });
}

export const ProfitReportView: React.FC = () => {
  // Segmentación Principal: 'management' (Dueña) vs 'tax' (Contador)
  const [reportMode, setReportMode] = useState<'management' | 'tax'>('management');

  // Filtro de Rango de Fechas
  const [periodPreset, setPeriodPreset] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('today');
  const initialTodayYMD = getPeruYMD();
  const [customStart, setCustomStart] = useState<string>(initialTodayYMD);
  const [customEnd, setCustomEnd] = useState<string>(initialTodayYMD);

  // Estados de datos
  const [managementData, setManagementData] = useState<ManagementReportResponse | null>(cachedManagementData);
  const [taxData, setTaxData] = useState<TaxBookResponse | null>(cachedTaxData);
  const [isLoading, setIsLoading] = useState<boolean>(!cachedManagementData);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [isDownloadingSire, setIsDownloadingSire] = useState<boolean>(false);

  // Sub-pestañas para reporte gerencial
  const [managementTab, setManagementTab] = useState<'sales' | 'expenses'>('sales');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedSale, setSelectedSale] = useState<any | null>(null);

  // Turnos para filtrado específico
  const [shiftsList, setShiftsList] = useState<any[]>(cachedShiftsDropdown);
  const [selectedShiftId, setSelectedShiftId] = useState<string>('all');

  useEffect(() => {
    if (cachedShiftsDropdown.length === 0) {
      apiRequest<any[]>('/cash-shifts/history?limit=15&minimal=true')
        .then((data) => {
          const list = data || [];
          setShiftsList(list);
          cachedShiftsDropdown = list;
        })
        .catch((err) => console.error('Error cargando historial de turnos:', err));
    }
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
        cachedManagementData = res;
      } else {
        const res = await apiRequest<TaxBookResponse>(`/reports/tax-book?${params.toString()}`);
        setTaxData(res);
        cachedTaxData = res;
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
      toast.success('Reporte Excel generado y descargado con éxito.');
    } catch (err: any) {
      toast.error(`Error descargando reporte Excel: ${err.message || err}`);
    } finally {
      setIsDownloading(false);
    }
  };

  // Descarga en formato TXT oficial SUNAT SIRE RVIE (Anexo 3)
  const handleExportSireTxt = async () => {
    setIsDownloadingSire(true);
    try {
      const { startDate, endDate } = getDateRangeParams();
      const params = new URLSearchParams();

      if (selectedShiftId !== 'all') {
        params.append('shiftId', selectedShiftId);
      } else {
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
      }

      await downloadReportBlob(
        `/reports/tax-book/sire?${params.toString()}`,
        `SIRE_RVIE_${getPeruYMD()}.txt`,
      );
      toast.success('Archivo oficial SUNAT SIRE RVIE (.TXT) descargado con éxito.');
    } catch (err: any) {
      toast.error(`Error descargando archivo SIRE: ${err.message || err}`);
    } finally {
      setIsDownloadingSire(false);
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
      r.series.toLowerCase().includes(q) ||
      (r.modifiedDocument && r.modifiedDocument.toLowerCase().includes(q))
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

          {/* Descarga SIRE TXT (solo modo Libro SUNAT) */}
          {reportMode === 'tax' && (
            <button
              onClick={handleExportSireTxt}
              disabled={isDownloadingSire || isLoading}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-md disabled:opacity-50 bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-950/40"
              title="Descargar archivo plano pipe-delimited (.TXT) oficial para SUNAT SIRE RVIE (Anexo 3)"
            >
              <Download className={`w-3.5 h-3.5 ${isDownloadingSire ? 'animate-bounce' : ''}`} />
              <span>{isDownloadingSire ? 'Exportando...' : 'Descargar SIRE (.TXT)'}</span>
            </button>
          )}

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

      {/* Notificación Compacta cuando no hay transacciones en 'Hoy' */}
      {selectedShiftId === 'all' &&
        periodPreset === 'today' &&
        !isLoading &&
        ((reportMode === 'management' && (!managementData?.salesDetail || managementData.salesDetail.length === 0)) ||
          (reportMode === 'tax' && (!taxData?.records || taxData.records.length === 0))) && (
        <div className="mb-4 px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25 flex flex-wrap items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-2 text-amber-300 font-medium">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>Sin comprobantes emitidos hoy ({formatPeruDate(new Date())}). Si operaste de madrugada, las ventas corresponden a su día de emisión:</span>
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
                {isLoading && !managementData ? (
                  <div className="py-1">
                    <div className="h-6 w-24 bg-slate-800/80 rounded animate-pulse" />
                  </div>
                ) : (
                  <div className="text-xl font-black text-white">
                    {formatCurrency(managementData?.summary.totalGrossRevenue || 0)}
                  </div>
                )}
              </div>
              <div className="mt-2 text-[11px] text-slate-400">
                {isLoading && !managementData ? (
                  <div className="h-3 w-28 bg-slate-800/50 rounded animate-pulse" />
                ) : (
                  `${managementData?.summary.salesCount || 0} ventas registradas`
                )}
              </div>
            </div>

            {/* Costo Mercadería (COGS) */}
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
              <div>
                <div className="text-xs text-slate-400 font-semibold mb-1 flex items-center justify-between">
                  <span>Costo Mercadería (COGS)</span>
                  <Package className="w-4 h-4 text-amber-400" />
                </div>
                {isLoading && !managementData ? (
                  <div className="py-1">
                    <div className="h-6 w-24 bg-slate-800/80 rounded animate-pulse" />
                  </div>
                ) : (
                  <div className="text-xl font-black text-amber-400">
                    {formatCurrency(managementData?.summary.totalCogs || 0)}
                  </div>
                )}
              </div>
              <div className="mt-2 text-[11px] text-slate-400">
                {isLoading && !managementData ? (
                  <div className="h-3 w-28 bg-slate-800/50 rounded animate-pulse" />
                ) : (
                  `${managementData?.summary.totalUnitsSold || 0} unidades vendidas`
                )}
              </div>
            </div>

            {/* Ganancia Bruta Real */}
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
              <div>
                <div className="text-xs text-slate-400 font-semibold mb-1 flex items-center justify-between">
                  <span>Ganancia Bruta Real</span>
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                </div>
                {isLoading && !managementData ? (
                  <div className="py-1">
                    <div className="h-6 w-24 bg-slate-800/80 rounded animate-pulse" />
                  </div>
                ) : (
                  <div className="text-xl font-black text-emerald-400">
                    {formatCurrency(managementData?.summary.grossProfit || 0)}
                  </div>
                )}
              </div>
              <div className="mt-2 text-[11px] text-emerald-400/90 font-medium">
                {isLoading && !managementData ? (
                  <div className="h-3 w-24 bg-slate-800/50 rounded animate-pulse" />
                ) : (
                  `Margen Bruto: ${managementData?.summary.grossMarginPct || 0}%`
                )}
              </div>
            </div>

            {/* Salidas de Caja Chica */}
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
              <div>
                <div className="text-xs text-slate-400 font-semibold mb-1 flex items-center justify-between">
                  <span>Gastos Operativos Caja</span>
                  <ArrowDownRight className="w-4 h-4 text-rose-400" />
                </div>
                {isLoading && !managementData ? (
                  <div className="py-1">
                    <div className="h-6 w-20 bg-slate-800/80 rounded animate-pulse" />
                  </div>
                ) : (
                  <div className="text-xl font-black text-rose-400">
                    -{formatCurrency(managementData?.summary.operatingExpenses ?? managementData?.summary.totalExpenses ?? 0)}
                  </div>
                )}
              </div>
              <div className="mt-2 text-[11px] text-slate-400">
                {(managementData?.summary.voidRefundExpenses ?? 0) > 0
                  ? `+${formatCurrency(managementData?.summary.voidRefundExpenses || 0)} dev. anulaciones`
                  : 'Salidas operativas de efectivo'}
              </div>
            </div>

            {/* Ganancia Neta Real */}
            <div className="p-4 rounded-2xl bg-slate-900 border border-emerald-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/20 flex flex-col justify-between">
              <div>
                <div className="text-xs text-emerald-400 font-bold mb-1 flex items-center justify-between">
                  <span>Ganancia Neta Real</span>
                  <Wallet className="w-4 h-4 text-emerald-400" />
                </div>
                {isLoading && !managementData ? (
                  <div className="py-1">
                    <div className="h-6 w-24 bg-slate-800/80 rounded animate-pulse" />
                  </div>
                ) : (
                  <div className="text-xl font-black text-emerald-300">
                    {formatCurrency(managementData?.summary.netProfit || 0)}
                  </div>
                )}
              </div>
              <div className="mt-2 text-[11px] text-emerald-300/90 font-semibold">
                {isLoading && !managementData ? (
                  <div className="h-3 w-24 bg-slate-800/50 rounded animate-pulse" />
                ) : (
                  `Margen Neto: ${managementData?.summary.netMarginPct || 0}%`
                )}
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
                    <Banknote className="w-3.5 h-3.5 text-indigo-400" />
                    (+) Fondo Inicial de Caja (Apertura)
                  </span>
                  <span className="font-bold text-indigo-400">
                    +{formatCurrency(managementData?.summary.totalInitialBalances || 0)}
                  </span>
                </div>

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
                        <td className="py-2.5 px-3 text-right font-bold text-white font-mono tabular-nums whitespace-nowrap">
                          {formatCurrency(sale.totalAmount)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-amber-400 font-mono tabular-nums whitespace-nowrap">
                          {formatCurrency(sale.totalCost)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-400 font-mono tabular-nums whitespace-nowrap">
                          {formatCurrency(sale.profit)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-slate-300 font-mono tabular-nums whitespace-nowrap">
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
                        <td className="py-2.5 px-3 text-right font-bold font-mono tabular-nums whitespace-nowrap">
                          <span className={m.type === 'EXPENSE' ? 'text-rose-400' : 'text-emerald-400'}>
                            {m.type === 'EXPENSE' ? '-' : '+'}
                            {formatCurrency(m.amount)}
                          </span>
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
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
            {/* Base Imponible Total */}
            <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-colors">
              <div>
                <div className="text-xs text-slate-400 font-semibold mb-1 flex items-center justify-between">
                  <span className="truncate">Op. Gravada Neta</span>
                  <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                </div>
                {isLoading && !taxData ? (
                  <div className="py-1">
                    <div className="h-6 w-20 bg-slate-800/80 rounded animate-pulse" />
                  </div>
                ) : (
                  <div className="text-xl font-black text-white font-mono tabular-nums whitespace-nowrap">
                    {formatCurrency(taxData?.summary.totalTaxableBase || 0)}
                  </div>
                )}
              </div>
              <div className="mt-1.5 text-[10px] text-slate-400 truncate">
                Base imponible acumulada
              </div>
            </div>

            {/* Total IGV Facturado */}
            <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-colors">
              <div>
                <div className="text-xs text-slate-400 font-semibold mb-1 flex items-center justify-between">
                  <span className="truncate">Total IGV Neto</span>
                  <Scale className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                </div>
                {isLoading && !taxData ? (
                  <div className="py-1">
                    <div className="h-6 w-20 bg-slate-800/80 rounded animate-pulse" />
                  </div>
                ) : (
                  <div className="text-xl font-black text-indigo-400 font-mono tabular-nums whitespace-nowrap">
                    {formatCurrency(taxData?.summary.totalIgv || 0)}
                  </div>
                )}
              </div>
              <div className="mt-1.5 text-[10px] text-slate-400 truncate">
                Débito fiscal a declarar
              </div>
            </div>

            {/* Total Facturado Fiscal */}
            <div className="p-3.5 rounded-2xl bg-slate-900 border border-blue-500/30 flex flex-col justify-between hover:border-blue-500/50 transition-colors shadow-sm shadow-blue-950/20">
              <div>
                <div className="text-xs text-blue-400 font-bold mb-1 flex items-center justify-between">
                  <span className="truncate">Total Neto SUNAT</span>
                  <Receipt className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                </div>
                {isLoading && !taxData ? (
                  <div className="py-1">
                    <div className="h-6 w-20 bg-slate-800/80 rounded animate-pulse" />
                  </div>
                ) : (
                  <div className="text-xl font-black text-blue-300 font-mono tabular-nums whitespace-nowrap">
                    {formatCurrency(taxData?.summary.totalAmount || 0)}
                  </div>
                )}
              </div>
              <div className="mt-1.5 text-[10px] text-blue-300/80 font-medium truncate">
                {isLoading && !taxData ? (
                  <div className="h-3 w-20 bg-slate-800/50 rounded animate-pulse" />
                ) : (
                  `${taxData?.summary.totalFiscalSales || 0} registros oficiales`
                )}
              </div>
            </div>

            {/* Pago a Cuenta Impuesto a la Renta 1% (RMT) */}
            <div className="p-3.5 rounded-2xl bg-slate-900 border border-amber-500/30 flex flex-col justify-between hover:border-amber-500/50 transition-colors shadow-sm shadow-amber-950/20">
              <div>
                <div className="text-xs text-amber-400 font-bold mb-1 flex items-center justify-between gap-1">
                  <span className="truncate">Renta 1% (RMT)</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/80 shrink-0 font-mono">
                    1%
                  </span>
                </div>
                {isLoading && !taxData ? (
                  <div className="py-1">
                    <div className="h-6 w-20 bg-slate-800/80 rounded animate-pulse" />
                  </div>
                ) : (
                  <div className="text-xl font-black text-amber-300 font-mono tabular-nums whitespace-nowrap">
                    {formatCurrency(taxData?.summary.estimatedIncomeTax1Pct ?? Number(((taxData?.summary.totalTaxableBase || 0) * 0.01).toFixed(2)))}
                  </div>
                )}
              </div>
              <div className="mt-1.5 text-[10px] text-amber-300/80 font-medium truncate">
                Pago a Cta. MYPE Tributario
              </div>
            </div>

            {/* Boletas Emitidas (03) */}
            <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-colors">
              <div>
                <div className="text-xs text-slate-300 font-semibold mb-1 flex items-center justify-between gap-1">
                  <span className="truncate">Boletas</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-950/80 text-blue-300 border border-blue-800/80 shrink-0 font-mono">
                    Tipo 03
                  </span>
                </div>
                {isLoading && !taxData ? (
                  <div className="py-1">
                    <div className="h-6 w-12 bg-slate-800/80 rounded animate-pulse" />
                  </div>
                ) : (
                  <div className="text-xl font-black text-white font-mono tabular-nums">
                    {taxData?.summary.receiptCount || 0}
                  </div>
                )}
              </div>
              <div className="mt-1.5 text-[10px] text-slate-400 truncate">
                B001 / B002 · Clientes DNI
              </div>
            </div>

            {/* Facturas Emitidas (01) */}
            <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-colors">
              <div>
                <div className="text-xs text-slate-300 font-semibold mb-1 flex items-center justify-between gap-1">
                  <span className="truncate">Facturas</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/80 shrink-0 font-mono">
                    Tipo 01
                  </span>
                </div>
                {isLoading && !taxData ? (
                  <div className="py-1">
                    <div className="h-6 w-12 bg-slate-800/80 rounded animate-pulse" />
                  </div>
                ) : (
                  <div className="text-xl font-black text-white font-mono tabular-nums">
                    {taxData?.summary.invoiceCount || 0}
                  </div>
                )}
              </div>
              <div className="mt-1.5 text-[10px] text-slate-400 truncate">
                F001 / F002 · Empresas RUC
              </div>
            </div>

            {/* Notas de Crédito (07) */}
            <div className="p-3.5 rounded-2xl bg-slate-900 border border-rose-500/30 flex flex-col justify-between hover:border-rose-500/50 transition-colors shadow-sm shadow-rose-950/20">
              <div>
                <div className="text-xs text-rose-300 font-bold mb-1 flex items-center justify-between gap-1">
                  <span className="truncate">Notas Crédito</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800/80 shrink-0 font-mono">
                    Tipo 07
                  </span>
                </div>
                {isLoading && !taxData ? (
                  <div className="py-1">
                    <div className="h-6 w-12 bg-slate-800/80 rounded animate-pulse" />
                  </div>
                ) : (
                  <div className="text-xl font-black text-rose-400 font-mono tabular-nums">
                    {taxData?.summary.creditNoteCount || 0}
                  </div>
                )}
              </div>
              <div className="mt-1.5 text-[10px] text-rose-300/80 font-medium truncate">
                BC01 / FC01 · Restan ventas
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
                  Visualización previa de las columnas exactas que exporta el archivo Excel oficial RVIE.
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

            <div className="overflow-x-auto rounded-xl border border-slate-800/80">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800 text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-3 text-center w-12 whitespace-nowrap">N°</th>
                    <th className="py-3 px-3 text-center w-28 whitespace-nowrap">Fecha Emisión</th>
                    <th className="py-3 px-3 text-center w-24 whitespace-nowrap">Tipo</th>
                    <th className="py-3 px-3 text-center w-16 whitespace-nowrap">Serie</th>
                    <th className="py-3 px-3 text-center w-24 whitespace-nowrap">Correlativo</th>
                    <th className="py-3 px-3 text-center w-20 whitespace-nowrap">Tipo Doc.</th>
                    <th className="py-3 px-3 text-center w-28 whitespace-nowrap">N° Documento</th>
                    <th className="py-3 px-3 min-w-[240px]">Razón Social / Cliente</th>
                    <th className="py-3 px-3 text-right w-28 min-w-[115px] whitespace-nowrap">Base Imponible</th>
                    <th className="py-3 px-3 text-right w-28 min-w-[110px] whitespace-nowrap">IGV (18%)</th>
                    <th className="py-3 px-3 text-right w-32 min-w-[125px] whitespace-nowrap">Importe Total</th>
                    <th className="py-3 px-3 text-center w-36 whitespace-nowrap">Estado SUNAT</th>
                    <th className="py-3 px-3 text-center w-36 whitespace-nowrap">Archivos SUNAT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {filteredTaxRecords.map((rec) => {
                    const isCreditNote = rec.sunatDocTypeCode === '07';
                    const isVoided = rec.emissionStatus.includes('ANULADO');

                    return (
                      <tr
                        key={rec.id}
                        className={`transition-colors hover:bg-slate-800/40 ${
                          isCreditNote
                            ? 'bg-rose-500/[0.04] border-l-2 border-l-rose-500'
                            : isVoided
                              ? 'bg-amber-500/[0.02] border-l-2 border-l-amber-500/50'
                              : 'border-l-2 border-l-transparent'
                        }`}
                      >
                        <td className="py-3 px-3 text-center text-slate-400 tabular-nums">{rec.itemNumber}</td>
                        <td className="py-3 px-3 text-center text-slate-300 whitespace-nowrap">{rec.issueDate}</td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                              isCreditNote
                                ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                : rec.sunatDocTypeCode === '01'
                                  ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                  : 'bg-blue-950 text-blue-300 border border-blue-800'
                            }`}
                          >
                            {rec.sunatDocTypeCode} ({isCreditNote ? 'N/C' : rec.sunatDocTypeCode === '01' ? 'FAC' : 'BOL'})
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-white whitespace-nowrap">{rec.series}</td>
                        <td className="py-3 px-3 text-center text-slate-300 tabular-nums whitespace-nowrap">{rec.formattedCorrelative}</td>
                        <td className="py-3 px-3 text-center text-slate-400 font-bold whitespace-nowrap">
                          {rec.customerDocType === '6'
                            ? '6 (RUC)'
                            : rec.customerDocType === '1'
                              ? '1 (DNI)'
                              : rec.customerDocType === '4'
                                ? '4 (C.E.)'
                                : rec.customerDocType === '-'
                                  ? '- (S/D)'
                                  : `${rec.customerDocType} (S/D)`}
                        </td>
                        <td className="py-3 px-3 text-center text-slate-200 tabular-nums whitespace-nowrap">{rec.customerDocument}</td>
                        <td className="py-3 px-3 font-sans max-w-xs">
                          <div className="font-medium text-slate-100 truncate" title={rec.customerName}>
                            {rec.customerName}
                          </div>
                          {rec.modifiedDocument && (
                            <div className="text-[10px] text-rose-300 font-mono mt-1 flex items-center gap-1.5 whitespace-nowrap">
                              <span className="px-1.5 py-0.2 rounded bg-rose-950/80 text-rose-300 border border-rose-800/70 text-[9px] font-bold tracking-wider">
                                MODIFICA
                              </span>
                              <span>{rec.modifiedDocument}</span>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap min-w-[115px]">
                          <span className={rec.taxableBase < 0 ? 'text-rose-400 font-semibold' : 'text-slate-300'}>
                            {formatCurrency(rec.taxableBase)}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap min-w-[110px]">
                          <span className={rec.igvAmount < 0 ? 'text-rose-400 font-semibold' : 'text-indigo-400 font-medium'}>
                            {formatCurrency(rec.igvAmount)}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap min-w-[125px]">
                          <span className={rec.totalAmount < 0 ? 'text-rose-400 font-bold' : 'text-white font-bold'}>
                            {formatCurrency(rec.totalAmount)}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center font-sans whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide ${
                              isVoided
                                ? 'bg-rose-950/80 text-rose-300 border border-rose-800'
                                : rec.emissionStatus === 'SIMULATED'
                                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                                  : 'bg-blue-950/80 text-blue-300 border border-blue-800'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${isVoided ? 'bg-rose-400' : 'bg-emerald-400'}`} />
                            {rec.emissionStatus}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center font-sans whitespace-nowrap">
                          {(() => {
                            const safePdf = sanitizeExternalUrl(rec.pdfUrl);
                            const safeXml = sanitizeExternalUrl(rec.xmlUrl);
                            const safeCdr = sanitizeExternalUrl(rec.cdrUrl);
                            return (
                              <div className="flex items-center justify-center gap-1">
                                {safePdf ? (
                                  <a
                                    href={safePdf}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-1.5 py-0.5 rounded bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 text-[10px] font-bold border border-indigo-500/30 transition-all"
                                    title="Descargar Representación Gráfica (PDF)"
                                  >
                                    PDF
                                  </a>
                                ) : null}
                                {safeXml ? (
                                  <a
                                    href={safeXml}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-1.5 py-0.5 rounded bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 text-[10px] font-mono font-bold border border-emerald-500/30 transition-all"
                                    title="Descargar XML firmado (UBL 2.1)"
                                  >
                                    XML
                                  </a>
                                ) : null}
                                {safeCdr ? (
                                  <a
                                    href={safeCdr}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-1.5 py-0.5 rounded bg-amber-600/20 hover:bg-amber-600/40 text-amber-300 text-[10px] font-mono font-bold border border-amber-500/30 transition-all"
                                    title="Descargar Constancia de Recepción (CDR SUNAT)"
                                  >
                                    CDR
                                  </a>
                                ) : null}
                                {!safePdf && !safeXml && !safeCdr && (
                                  <span className="text-slate-600 text-[10px]">-</span>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredTaxRecords.length === 0 && (
                    <tr>
                      <td colSpan={13} className="py-12 text-center text-slate-500 font-sans">
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

                {/* Fila de Totales Generales / Subtotal Filtrado */}
                {filteredTaxRecords.length > 0 && (() => {
                  const isFiltered = searchTerm.trim().length > 0;
                  const footTaxable = isFiltered
                    ? Number(filteredTaxRecords.reduce((acc, r) => acc + r.taxableBase, 0).toFixed(2))
                    : (taxData?.summary.totalTaxableBase || 0);
                  const footIgv = isFiltered
                    ? Number(filteredTaxRecords.reduce((acc, r) => acc + r.igvAmount, 0).toFixed(2))
                    : (taxData?.summary.totalIgv || 0);
                  const footTotal = isFiltered
                    ? Number(filteredTaxRecords.reduce((acc, r) => acc + r.totalAmount, 0).toFixed(2))
                    : (taxData?.summary.totalAmount || 0);

                  return (
                    <tfoot className="bg-slate-950 text-white font-bold border-t-2 border-slate-700">
                      <tr>
                        <td colSpan={8} className="py-3 px-3 text-right font-sans text-xs uppercase tracking-wider text-slate-400">
                          {isFiltered
                            ? `SUBTOTAL FILTRADO (${filteredTaxRecords.length} REGISTROS):`
                            : 'TOTALES GENERALES DEL PERIODO:'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap text-slate-200 min-w-[115px]">
                          {formatCurrency(footTaxable)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap text-indigo-400 min-w-[110px]">
                          {formatCurrency(footIgv)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap text-emerald-400 text-sm min-w-[125px]">
                          {formatCurrency(footTotal)}
                        </td>
                        <td></td>
                        <td></td>
                      </tr>
                    </tfoot>
                  );
                })()}
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
