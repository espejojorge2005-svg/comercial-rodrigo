import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../../api/client.js';
import {
  formatCurrency,
  formatPeruDate,
  formatPeruTime,
  formatPeruDateTime,
} from '../../lib/utils.js';
import {
  History,
  AlertTriangle,
  Lock,
  Clock,
  Search,
  RefreshCw,
  Eye,
  X,
  Banknote,
  QrCode,
  CreditCard,
  Layers,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  FileText,
  FileSpreadsheet,
  Printer,
} from 'lucide-react';
import { useConfigStore } from '../../store/useConfigStore.js';
import { exportShiftAuditExcel } from '../../lib/excelExport.js';
import { ShiftReceiptTicketModal } from './ShiftReceiptTicketModal.js';

export const ShiftAuditView: React.FC = () => {
  const { config } = useConfigStore();
  const [shifts, setShifts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedShift, setSelectedShift] = useState<any | null>(null);
  const [ticketShift, setTicketShift] = useState<any | null>(null);

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiRequest('/cash-shifts/history');
      setShifts(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const filteredShifts = shifts.filter((s) => {
    const q = searchTerm.toLowerCase();
    const regName = (s.cashRegister?.name || '').toLowerCase();
    const userName = (s.user?.name || '').toLowerCase();
    return regName.includes(q) || userName.includes(q);
  });

  const totalShifts = shifts.length;
  const openShiftsCount = shifts.filter((s) => s.status === 'OPEN').length;
  const closedShifts = shifts.filter((s) => s.status === 'CLOSED');
  const discrepancyCount = closedShifts.filter((s) => s.difference && Math.abs(s.difference) > 0.1).length;

  const sumInitial = filteredShifts.reduce((acc, s) => acc + (Number(s.initialBalance) || 0), 0);
  const sumSales = filteredShifts.reduce((acc, s) => acc + (Number(s.metrics?.totalSales) || 0), 0);
  const sumCashSales = filteredShifts.reduce((acc, s) => acc + (Number(s.metrics?.cashFromSales) || 0), 0);
  const sumDigitalSales = filteredShifts.reduce((acc, s) => acc + (Number(s.metrics?.digitalFromSales) || 0), 0);
  const sumActual = filteredShifts.reduce((acc, s) => acc + (s.actualBalance !== null ? Number(s.actualBalance) : 0), 0);
  const sumExpected = filteredShifts.reduce((acc, s) => acc + (s.expectedBalance !== null ? Number(s.expectedBalance) : 0), 0);
  const sumDiff = filteredShifts.reduce((acc, s) => acc + (s.difference !== null ? Number(s.difference) : 0), 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 text-slate-100">
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-white flex items-center gap-2.5">
            <History className="w-6 h-6 text-slate-300" />
            Auditoría de Cajas & Arqueo Ciego
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Control de cobros en efectivo, Yape/Plin, tarjetas, pagos mixtos y arqueos contra gaveta física.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
          <button
            onClick={() => exportShiftAuditExcel(filteredShifts.length > 0 ? filteredShifts : shifts, config.name)}
            disabled={shifts.length === 0}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 border border-slate-700 transition-all cursor-pointer shadow-sm disabled:opacity-50"
            title="Exportar Arqueos, Ventas y Gastos a Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Exportar Excel</span>
          </button>

          <button
            onClick={fetchHistory}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 border border-slate-700 transition-all cursor-pointer shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Tarjetas de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Turnos Totales</span>
            <Lock className="w-4 h-4 text-slate-300" />
          </div>
          <div className="text-xl font-extrabold text-white">{totalShifts}</div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Cajas Operando Ahora</span>
            <Clock className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-extrabold text-emerald-400">
            {openShiftsCount} {openShiftsCount === 1 ? 'activa' : 'activas'}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Turnos con Descuadre</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div
            className={`text-xl font-extrabold ${discrepancyCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}
          >
            {discrepancyCount}
          </div>
        </div>
      </div>

      {/* Tabla de Turnos */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
        <div className="mb-4 relative max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filtrar por caja o cajero..."
            className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 outline-none"
          />
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-800 max-h-[620px] shadow-inner bg-slate-950/40">
          <table className="w-full min-w-[1150px] text-left text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-950 text-slate-400 border-b border-slate-800 font-semibold uppercase tracking-wider text-[10px] shadow-sm">
              <tr>
                <th className="p-3.5 w-44">Caja</th>
                <th className="p-3.5 w-36">Cajero</th>
                <th className="p-3.5 w-32">Apertura</th>
                <th className="p-3.5 w-32">Cierre</th>
                <th className="p-3.5 text-right w-28">Fondo Inicial</th>
                <th className="p-3.5 text-right w-44">Cobros en Turno</th>
                <th className="p-3.5 text-right w-32">Conteo Cajero</th>
                <th className="p-3.5 text-right w-32">Esperado Gaveta</th>
                <th className="p-3.5 text-center w-36">Diferencia Arqueo</th>
                <th className="p-3.5 text-center w-24">Estado</th>
                <th className="p-3.5 text-center w-28">Auditoría</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
              {isLoading ? (
                <tr>
                  <td colSpan={11} className="p-10 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-slate-700 border-t-indigo-400 rounded-full animate-spin" />
                      <span>Cargando auditoría de turnos...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredShifts.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-10 text-center text-slate-500">
                    No hay turnos registrados con el filtro aplicado.
                  </td>
                </tr>
              ) : (
                filteredShifts.map((s) => {
                  const isOpen = s.status === 'OPEN';
                  const diff = s.difference !== null ? s.difference : null;
                  const hasDiscrepancy = diff !== null && Math.abs(diff) >= 0.05;
                  const metrics = s.metrics || {};

                  return (
                    <tr key={s.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="p-3.5 font-bold text-white whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span>{s.cashRegister?.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                            {s.cashRegister?.identifier}
                          </span>
                        </div>
                      </td>

                      <td className="p-3.5 text-slate-200 font-medium whitespace-nowrap">{s.user?.name}</td>

                      <td className="p-3.5 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                        <div className="font-semibold text-slate-200">{formatPeruTime(s.openedAt)}</div>
                        <div className="text-[10px] text-slate-500">{formatPeruDate(s.openedAt)}</div>
                      </td>

                      <td className="p-3.5 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                        {s.closedAt ? (
                          <>
                            <div className="font-semibold text-slate-200">{formatPeruTime(s.closedAt)}</div>
                            <div className="text-[10px] text-slate-500">{formatPeruDate(s.closedAt)}</div>
                          </>
                        ) : (
                          <span className="text-emerald-400 font-semibold font-sans">En curso</span>
                        )}
                      </td>

                      <td className="p-3.5 text-right font-mono text-slate-300 whitespace-nowrap font-medium">
                        {formatCurrency(s.initialBalance)}
                      </td>

                      {/* Cobros en Turno (Efectivo vs Digital) */}
                      <td className="p-3.5 text-right font-mono whitespace-nowrap">
                        <div className="font-bold text-white">
                          {formatCurrency(metrics.totalSales || 0)}
                        </div>
                        <div className="text-[10px] flex items-center justify-end gap-1.5 mt-0.5">
                          <span className="text-emerald-400 font-medium" title="Cobrado en Efectivo">
                            Ef: {formatCurrency(metrics.cashFromSales || 0)}
                          </span>
                          <span className="text-slate-700">|</span>
                          <span className="text-indigo-400 font-medium" title="Cobrado Digital (Yape, Plin, Tarjetas)">
                            Dig: {formatCurrency(metrics.digitalFromSales || 0)}
                          </span>
                        </div>
                      </td>

                      <td className="p-3.5 text-right font-mono font-bold text-white whitespace-nowrap">
                        {s.actualBalance !== null ? formatCurrency(s.actualBalance) : <span className="text-slate-600 font-sans font-normal">--</span>}
                      </td>

                      <td className="p-3.5 text-right font-mono text-slate-400 whitespace-nowrap">
                        {s.expectedBalance !== null ? formatCurrency(s.expectedBalance) : <span className="text-slate-600 font-sans font-normal">--</span>}
                      </td>

                      <td className="p-3.5 text-center whitespace-nowrap">
                        {isOpen ? (
                          <span className="text-[10px] text-slate-500 font-medium">En turno</span>
                        ) : diff === null ? (
                          <span className="text-[10px] text-slate-500 font-medium">--</span>
                        ) : !hasDiscrepancy ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-bold text-[10px] border border-emerald-500/25">
                            CUADRADO (S/ 0.00)
                          </span>
                        ) : diff < 0 ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-bold text-[10px] border border-rose-500/30">
                            FALTANTE: {formatCurrency(diff)}
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-bold text-[10px] border border-amber-500/30">
                            SOBRANTE: +{formatCurrency(diff)}
                          </span>
                        )}
                      </td>

                      <td className="p-3.5 text-center whitespace-nowrap">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            isOpen
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-slate-800 text-slate-400 border border-slate-700/60'
                          }`}
                        >
                          {isOpen ? 'OPERANDO' : 'CERRADO'}
                        </span>
                      </td>

                      <td className="p-3.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setSelectedShift(s)}
                            className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white transition-all cursor-pointer inline-flex items-center gap-1 text-[11px] font-semibold border border-slate-700 shadow-sm"
                            title="Inspeccionar auditoría completa de este turno"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Detalle</span>
                          </button>

                          <button
                            onClick={() => setTicketShift(s)}
                            className="p-1.5 rounded-xl bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white transition-all cursor-pointer inline-flex items-center justify-center text-[11px] font-semibold border border-slate-700 shadow-sm"
                            title="Imprimir ticket térmico de cierre (Corte Z)"
                          >
                            <Printer className="w-3.5 h-3.5 text-emerald-400 hover:text-white" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filteredShifts.length > 0 && (
              <tfoot className="sticky bottom-0 z-10 bg-slate-950 border-t-2 border-slate-700 text-xs font-semibold text-slate-300 shadow-lg">
                <tr>
                  <td colSpan={4} className="p-3.5 text-slate-400">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold">TOTALES AUDITORÍA:</span>
                      <span className="text-slate-400 text-[11px]">({filteredShifts.length} turnos listados)</span>
                    </div>
                  </td>
                  <td className="p-3.5 text-right font-mono font-bold text-white whitespace-nowrap">
                    {formatCurrency(sumInitial)}
                  </td>
                  <td className="p-3.5 text-right font-mono font-bold whitespace-nowrap">
                    <div className="text-white">{formatCurrency(sumSales)}</div>
                    <div className="text-[10px] flex items-center justify-end gap-1.5 mt-0.5 font-normal">
                      <span className="text-emerald-400">Ef: {formatCurrency(sumCashSales)}</span>
                      <span className="text-slate-700">|</span>
                      <span className="text-indigo-400">Dig: {formatCurrency(sumDigitalSales)}</span>
                    </div>
                  </td>
                  <td className="p-3.5 text-right font-mono font-bold text-white whitespace-nowrap">
                    {formatCurrency(sumActual)}
                  </td>
                  <td className="p-3.5 text-right font-mono text-slate-400 whitespace-nowrap">
                    {formatCurrency(sumExpected)}
                  </td>
                  <td className="p-3.5 text-center whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                        Math.abs(sumDiff) < 0.05
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                          : sumDiff < 0
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {Math.abs(sumDiff) < 0.05
                        ? 'S/ 0.00'
                        : `${sumDiff > 0 ? '+' : ''}${formatCurrency(sumDiff)}`}
                    </span>
                  </td>
                  <td colSpan={2} className="p-3.5 text-center text-slate-600 text-[11px]">--</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Modal de Detalle de Auditoría */}
      {selectedShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl relative text-slate-100 max-h-[92vh] overflow-y-auto">
            <button
              onClick={() => setSelectedShift(null)}
              className="absolute right-5 top-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pr-10">
              <div>
                <div className="flex items-center gap-2.5 mb-1">
                  <History className="w-5 h-5 text-indigo-400" />
                  <h3 className="text-lg font-bold text-white">
                    Auditoría Completa de Turno: {selectedShift.cashRegister?.name}
                  </h3>
                </div>
                <p className="text-xs text-slate-400">
                  Cajero: <span className="text-white font-semibold">{selectedShift.user?.name}</span> |
                  Apertura: <span className="font-mono text-slate-300">{formatPeruDateTime(selectedShift.openedAt)}</span>
                  {selectedShift.closedAt && (
                    <>
                      {' '}| Cierre: <span className="font-mono text-slate-300">{formatPeruDateTime(selectedShift.closedAt)}</span>
                    </>
                  )}
                </p>
              </div>

              <button
                onClick={() => setTicketShift(selectedShift)}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/30 transition-all cursor-pointer shrink-0 self-start sm:self-auto"
                title="Imprimir Corte Z en Tiquetera Térmica"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir Corte Z</span>
              </button>
            </div>

            {/* Cuadro de Arqueo Físico vs Esperado */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 mb-5 space-y-3">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Banknote className="w-4 h-4 text-emerald-400" />
                Arqueo de Efectivo en Gaveta Física
              </h4>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 block">Fondo Inicial</span>
                  <span className="text-sm font-bold font-mono text-slate-200">
                    {formatCurrency(selectedShift.initialBalance)}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 block">(+) Ventas Efectivo</span>
                  <span className="text-sm font-bold font-mono text-emerald-400">
                    +{formatCurrency(selectedShift.metrics?.cashFromSales || 0)}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 block">(+/-) Caja Chica</span>
                  <span className="text-sm font-bold font-mono text-amber-400">
                    {formatCurrency((selectedShift.metrics?.incomeMovements || 0) - (selectedShift.metrics?.expenseMovements || 0))}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30">
                  <span className="text-[10px] text-indigo-300 font-semibold block">(=) Saldo Esperado</span>
                  <span className="text-sm font-extrabold font-mono text-indigo-200">
                    {selectedShift.expectedBalance !== null ? formatCurrency(selectedShift.expectedBalance) : formatCurrency(selectedShift.initialBalance + (selectedShift.metrics?.cashFromSales || 0) + (selectedShift.metrics?.incomeMovements || 0) - (selectedShift.metrics?.expenseMovements || 0))}
                  </span>
                </div>
              </div>

              {/* Resultado del conteo */}
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-400">Efectivo Contado por Cajero:</span>
                  <span className="ml-2 font-mono font-bold text-white text-sm">
                    {selectedShift.actualBalance !== null ? formatCurrency(selectedShift.actualBalance) : 'Turno aún abierto'}
                  </span>
                </div>

                <div>
                  {selectedShift.difference !== null ? (
                    Math.abs(selectedShift.difference) < 0.05 ? (
                      <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30 flex items-center gap-1.5 text-xs">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Caja Cuadrada Exacta (S/ 0.00)
                      </span>
                    ) : selectedShift.difference < 0 ? (
                      <span className="px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-400 font-bold border border-rose-500/30 flex items-center gap-1.5 text-xs">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Faltante en Gaveta: {formatCurrency(selectedShift.difference)}
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30 flex items-center gap-1.5 text-xs">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Sobrante en Gaveta: +{formatCurrency(selectedShift.difference)}
                      </span>
                    )
                  ) : null}
                </div>
              </div>
            </div>

            {/* Desglose por Método de Pago */}
            <div className="mb-5">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5 flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                Desglose de Ventas por Método de Pago
              </h4>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {/* Efectivo */}
                <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                  <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                    <Banknote className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Efectivo Puro</span>
                  </div>
                  <div className="text-base font-extrabold text-white font-mono">
                    {formatCurrency(selectedShift.metrics?.pureCashSales || 0)}
                  </div>
                </div>

                {/* Yape / Plin */}
                <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                  <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                    <QrCode className="w-3.5 h-3.5 text-violet-400" />
                    <span>Yape / Plin</span>
                  </div>
                  <div className="text-base font-extrabold text-violet-300 font-mono">
                    {formatCurrency(selectedShift.metrics?.yapePlinSales || 0)}
                  </div>
                </div>

                {/* Tarjetas */}
                <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                  <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                    <CreditCard className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Tarjetas</span>
                  </div>
                  <div className="text-base font-extrabold text-cyan-300 font-mono">
                    {formatCurrency(selectedShift.metrics?.cardSales || 0)}
                  </div>
                </div>

                {/* Pagos Mixtos */}
                <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                  <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                    <Layers className="w-3.5 h-3.5 text-amber-400" />
                    <span>Pago Mixto</span>
                  </div>
                  <div className="text-base font-extrabold text-amber-300 font-mono">
                    {formatCurrency(selectedShift.metrics?.mixedSales || 0)}
                  </div>
                </div>
              </div>

              {/* Total Facturado */}
              <div className="mt-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  Total Facturado en Turno ({selectedShift.metrics?.salesCount || 0} tickets emitidos):
                </span>
                <span className="text-sm font-extrabold text-white font-mono">
                  {formatCurrency(selectedShift.metrics?.totalSales || 0)}
                </span>
              </div>
            </div>

            {/* Movimientos de Caja Chica */}
            {selectedShift.cashMovements && selectedShift.cashMovements.length > 0 && (
              <div className="mb-5">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-400" />
                  Movimientos de Caja Chica ({selectedShift.cashMovements.length})
                </h4>
                <div className="space-y-1.5 max-h-36 overflow-y-auto rounded-xl border border-slate-800 p-2 bg-slate-950">
                  {selectedShift.cashMovements.map((m: any) => {
                    const isIncome = m.type === 'INCOME';
                    return (
                      <div
                        key={m.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`p-1 rounded-md ${
                              isIncome ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                            }`}
                          >
                            {isIncome ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                          </span>
                          <div>
                            <span className="font-semibold text-white">{m.reason}</span>
                            <span className="text-[10px] text-slate-500 block">
                              {formatPeruTime(m.createdAt, true)}
                            </span>
                          </div>
                        </div>

                        <span
                          className={`font-mono font-bold ${
                            isIncome ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {isIncome ? '+' : '-'}
                          {formatCurrency(Number(m.amount))}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Artículos Vendidos en el Turno */}
            {((selectedShift.soldProducts || selectedShift.metrics?.soldProducts || []).length > 0) && (
              <div className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-400" />
                    Resumen de Artículos Vendidos en el Turno
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    {(selectedShift.soldProducts || selectedShift.metrics?.soldProducts || []).reduce((acc: number, p: any) => acc + (Number(p.quantity) || 0), 0)} unidades totales
                  </span>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 max-h-56 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-slate-950 text-slate-400 border-b border-slate-800 text-[10px] uppercase font-semibold">
                      <tr>
                        <th className="p-2.5">Cant</th>
                        <th className="p-2.5">Producto</th>
                        <th className="p-2.5 text-right">Total Generado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                      {(selectedShift.soldProducts || selectedShift.metrics?.soldProducts || []).map((p: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-900/40">
                          <td className="p-2 font-bold text-emerald-400">{p.quantity} {p.unitType || 'UND'}</td>
                          <td className="p-2 font-sans text-slate-200">
                            <div>{p.productName}</div>
                            {p.barcode && <div className="text-[10px] font-mono text-slate-500">[{p.barcode}]</div>}
                          </td>
                          <td className="p-2 text-right font-bold text-white">
                            {formatCurrency(p.totalRevenue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Notas del Turno */}
            {selectedShift.notes && (
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300">
                <span className="font-semibold text-slate-400 block mb-0.5">Observaciones registradas:</span>
                {selectedShift.notes}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de Impresión Térmica de Corte Z */}
      <ShiftReceiptTicketModal
        isOpen={Boolean(ticketShift)}
        onClose={() => setTicketShift(null)}
        shiftData={
          ticketShift
            ? {
                shiftId: ticketShift.id,
                cajaName: ticketShift.cashRegister?.name || 'Caja',
                cajaIdentifier: ticketShift.cashRegister?.identifier,
                cashierName: ticketShift.user?.name || 'Cajero',
                openedAt: ticketShift.openedAt,
                closedAt: ticketShift.closedAt,
                initialBalance: Number(ticketShift.initialBalance) || 0,
                actualBalance: ticketShift.actualBalance !== null ? Number(ticketShift.actualBalance) : 0,
                expectedBalance: ticketShift.expectedBalance !== null ? Number(ticketShift.expectedBalance) : null,
                difference: ticketShift.difference !== null ? Number(ticketShift.difference) : null,
                isBlindAudit: false,
                salesCount: ticketShift.metrics?.salesCount || 0,
                cashFromSales: ticketShift.metrics?.cashFromSales || 0,
                digitalFromSales: ticketShift.metrics?.digitalFromSales || 0,
                yapePlinSales: ticketShift.metrics?.yapePlinSales || 0,
                cardSales: ticketShift.metrics?.cardSales || 0,
                pureCashSales: ticketShift.metrics?.pureCashSales || 0,
                mixedSales: ticketShift.metrics?.mixedSales || 0,
                totalSales: ticketShift.metrics?.totalSales || 0,
                incomeMovements: ticketShift.metrics?.incomeMovements || 0,
                expenseMovements: ticketShift.metrics?.expenseMovements || 0,
                soldProducts: ticketShift.soldProducts || ticketShift.metrics?.soldProducts || [],
                salesList: ticketShift.salesList || ticketShift.metrics?.salesList || [],
                notes: ticketShift.notes || null,
              }
            : null
        }
      />
    </div>
  );
};

