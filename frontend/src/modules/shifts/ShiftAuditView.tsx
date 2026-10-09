import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../../api/client.js';
import { formatCurrency } from '../../lib/utils.js';
import {
  History,
  AlertTriangle,
  Lock,
  Clock,
  Search,
  RefreshCw,
} from 'lucide-react';

export const ShiftAuditView: React.FC = () => {
  const [shifts, setShifts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');

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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 text-slate-100">
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-white flex items-center gap-2.5">
            <History className="w-6 h-6 text-indigo-400" />
            Auditoría de Cajas & Arqueo Ciego
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Historial de aperturas, cierres de caja y verificación de descuadres contra el sistema.
          </p>
        </div>

        <button
          onClick={fetchHistory}
          className="px-3.5 py-2 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 border border-slate-700 transition-all cursor-pointer self-start md:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Actualizar Historial
        </button>
      </div>

      {/* Tarjetas de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Turnos Totales</span>
            <Lock className="w-4 h-4 text-indigo-400" />
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

        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-semibold uppercase tracking-wider text-[10px]">
                <th className="p-3">Caja</th>
                <th className="p-3">Cajero</th>
                <th className="p-3">Apertura</th>
                <th className="p-3">Cierre</th>
                <th className="p-3 text-right">Fondo Inicial</th>
                <th className="p-3 text-right">Conteo Cajero</th>
                <th className="p-3 text-right">Saldo Esperado</th>
                <th className="p-3 text-center">Diferencia</th>
                <th className="p-3 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400">
                    Cargando auditoría de turnos...
                  </td>
                </tr>
              ) : filteredShifts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-500">
                    No hay turnos registrados aún.
                  </td>
                </tr>
              ) : (
                filteredShifts.map((s) => {
                  const isOpen = s.status === 'OPEN';
                  const diff = s.difference !== null ? s.difference : null;
                  const hasDiscrepancy = diff !== null && Math.abs(diff) >= 0.05;

                  return (
                    <tr key={s.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3 font-bold text-white">
                        {s.cashRegister?.name}{' '}
                        <span className="text-[10px] text-slate-500 font-mono">
                          ({s.cashRegister?.identifier})
                        </span>
                      </td>

                      <td className="p-3 text-slate-200 font-medium">{s.user?.name}</td>

                      <td className="p-3 font-mono text-[11px] text-slate-400">
                        {new Date(s.openedAt).toLocaleString()}
                      </td>

                      <td className="p-3 font-mono text-[11px] text-slate-400">
                        {s.closedAt ? new Date(s.closedAt).toLocaleString() : '--'}
                      </td>

                      <td className="p-3 text-right font-mono text-slate-300">
                        {formatCurrency(s.initialBalance)}
                      </td>

                      <td className="p-3 text-right font-mono font-bold text-white">
                        {s.actualBalance !== null ? formatCurrency(s.actualBalance) : '--'}
                      </td>

                      <td className="p-3 text-right font-mono text-slate-400">
                        {s.expectedBalance !== null ? formatCurrency(s.expectedBalance) : '--'}
                      </td>

                      <td className="p-3 text-center">
                        {isOpen ? (
                          <span className="text-[10px] text-slate-500">En turno</span>
                        ) : diff === null ? (
                          <span className="text-[10px] text-slate-500">--</span>
                        ) : !hasDiscrepancy ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-bold text-[10px] border border-emerald-500/20">
                            Cuadrado (S/ 0.00)
                          </span>
                        ) : diff < 0 ? (
                          <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-bold text-[10px] border border-rose-500/30">
                            Faltante: {formatCurrency(diff)}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-bold text-[10px] border border-amber-500/30">
                            Sobrante: +{formatCurrency(diff)}
                          </span>
                        )}
                      </td>

                      <td className="p-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isOpen
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {isOpen ? 'OPERANDO' : 'CERRADO'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
