import React, { useState } from 'react';
import { useShiftStore } from '../../store/useShiftStore.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { formatCurrency } from '../../lib/utils.js';
import { X, Lock, Coins, ShieldCheck, AlertTriangle } from 'lucide-react';

interface CloseShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CloseShiftModal: React.FC<CloseShiftModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuthStore();
  const { activeShift, closeShift, isLoading, error } = useShiftStore();

  const [actualBalance, setActualBalance] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [closeResult, setCloseResult] = useState<any>(null);
  const [showWarningTip, setShowWarningTip] = useState<boolean>(true);

  if (!isOpen || !activeShift) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const numericAmount = parseFloat(actualBalance) || 0;
      const res = await closeShift(numericAmount, notes);
      setCloseResult(res);
    } catch (err) {
      console.error(err);
    }
  };

  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative text-slate-100">
        <button
          onClick={onClose}
          className="absolute right-5 top-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {closeResult ? (
          /* Vista de Confirmación de Cierre */
          <div className="text-center py-4 space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
              <ShieldCheck className="w-8 h-8" />
            </div>

            <h3 className="text-xl font-bold text-white">¡Turno de Caja Cerrado!</h3>
            <p className="text-xs text-slate-300 max-w-sm mx-auto">{closeResult.message}</p>

            {/* Si es Admin, mostrar el resultado del arqueo */}
            {isAdmin && closeResult.hasDiscrepancy !== undefined && (
              <div className="mt-4 p-4 rounded-2xl bg-slate-950 border border-slate-800 text-left space-y-2 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Fondo Inicial:</span>
                  <span className="font-semibold text-white">
                    {formatCurrency(closeResult.initialBalance)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Ventas en Efectivo:</span>
                  <span className="font-semibold text-emerald-400">
                    +{formatCurrency(closeResult.cashFromSales)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Movimientos de Caja:</span>
                  <span className="font-semibold text-slate-300">
                    +{formatCurrency(closeResult.incomeMovements)} / -
                    {formatCurrency(closeResult.expenseMovements)}
                  </span>
                </div>
                <div className="border-t border-slate-800 pt-2 flex justify-between text-slate-300">
                  <span>Saldo Esperado:</span>
                  <span className="font-bold text-white">
                    {formatCurrency(closeResult.expectedBalance)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Efectivo Contado (Real):</span>
                  <span className="font-bold text-white">
                    {formatCurrency(closeResult.actualBalance)}
                  </span>
                </div>

                <div
                  className={`border-t border-slate-800 pt-2 flex justify-between font-bold text-sm ${
                    closeResult.difference === 0
                      ? 'text-emerald-400'
                      : closeResult.difference > 0
                        ? 'text-blue-400'
                        : 'text-rose-400'
                  }`}
                >
                  <span>Diferencia ({closeResult.discrepancyType}):</span>
                  <span>{formatCurrency(closeResult.difference)}</span>
                </div>
              </div>
            )}

            <button
              onClick={() => {
                setCloseResult(null);
                onClose();
              }}
              className="w-full mt-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold text-sm text-white transition-all cursor-pointer"
            >
              Aceptar y Salir
            </button>
          </div>
        ) : (
          /* Formulario de Arqueo Ciego */
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Cierre de Caja & Arqueo</h3>
                <p className="text-xs text-slate-400">
                  {activeShift.cashRegister?.name} • Iniciada a las{' '}
                  {new Date(activeShift.openedAt).toLocaleTimeString()}
                </p>
              </div>
            </div>

            {/* Aviso de Arqueo Ciego con botón para cerrar (X) */}
            {showWarningTip && (
              <div className="mb-5 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-200 text-xs flex items-start justify-between gap-3 relative transition-all animate-in fade-in duration-200">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
                  <div>
                    <span className="font-bold text-amber-300 block mb-0.5">
                      ⚠️ Recuerde contar TODO el efectivo físico de la gaveta
                    </span>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      Debe ingresar la suma total física que hay en el cajón:{' '}
                      <strong className="text-white">el Fondo Inicial (base de {formatCurrency(activeShift.initialBalance)})</strong>{' '}
                      más el <strong className="text-white">Efectivo cobrado por las ventas</strong>. No ingrese solo las ventas del día.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowWarningTip(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
                  title="Cerrar este aviso"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Coins className="w-4 h-4 text-amber-400" />
                    Efectivo Total en Gaveta Física (S/.)
                  </span>
                  <span className="text-[11px] font-medium text-amber-400 lowercase">
                    (fondo inicial + ventas)
                  </span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-base">
                    S/.
                  </span>
                  <input
                    type="number"
                    step="any"
                    value={actualBalance}
                    onChange={(e) => setActualBalance(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    placeholder="0.00"
                    required
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 rounded-2xl pl-12 pr-4 py-3.5 text-xl font-extrabold text-white outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-slate-400">
                  Cuente todos los billetes y monedas que hay en el cajón (incluye la base de apertura de {formatCurrency(activeShift.initialBalance)}).
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Observaciones del cierre (opcional)
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="ej. Todo en orden, billetes fajados"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl p-3 text-xs text-white placeholder-slate-500 outline-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-1/2 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 font-semibold text-xs text-slate-300 transition-all cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-1/2 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 font-bold text-xs text-white shadow-lg shadow-amber-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isLoading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <span>Confirmar Cierre</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
