import React, { useState } from 'react';
import { useShiftStore } from '../../store/useShiftStore.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { useOfflineSyncStore } from '../../store/useOfflineSyncStore.js';
import { formatCurrency, formatPeruTime } from '../../lib/utils.js';
import { X, Lock, Coins, ShieldCheck, AlertTriangle, Printer, RefreshCw } from 'lucide-react';
import { ShiftReceiptTicketModal, type ShiftReceiptData } from './ShiftReceiptTicketModal.js';
import { toast } from '../../store/useToastStore.js';

interface CloseShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CloseShiftModal: React.FC<CloseShiftModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuthStore();
  const { activeShift, closeShift, isLoading, error } = useShiftStore();
  const {
    pendingCount,
    quarantinedCount,
    isOnline,
    isSyncing,
    syncPendingSales,
  } = useOfflineSyncStore();

  const [actualBalance, setActualBalance] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [closeResult, setCloseResult] = useState<any>(null);
  const [closedShiftSnapshot, setClosedShiftSnapshot] = useState<any>(null);
  const [showWarningTip, setShowWarningTip] = useState<boolean>(true);
  const [showTicketModal, setShowTicketModal] = useState<boolean>(false);

  // Mantenemos los datos del turno que se está cerrando para que no desaparezca cuando activeShift sea null
  const currentShift = activeShift || closedShiftSnapshot;

  // Atajo de teclado: Escape para cancelar antes de cerrar
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !closeResult && !showTicketModal) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeResult, showTicketModal, onClose]);

  if (!isOpen || !currentShift) return null;

  const handleFinalClose = () => {
    setCloseResult(null);
    setClosedShiftSnapshot(null);
    setShowTicketModal(false);
    setActualBalance('');
    setNotes('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift) return;
    const numericAmount = parseFloat(actualBalance);
    if (isNaN(numericAmount) || numericAmount < 0) {
      toast.warning('Ingrese un monto válido mayor o igual a S/ 0.00.');
      return;
    }
    try {
      setClosedShiftSnapshot(activeShift);
      const res = await closeShift(Number(numericAmount.toFixed(2)), notes);
      setCloseResult(res);
      toast.success(res?.message || '¡Turno de caja cerrado exitosamente!');
      setShowTicketModal(true); // Abre la vista previa del ticket de inmediato
    } catch (err: any) {
      console.error('Error al cerrar turno:', err);
      toast.error(err.message || 'Error al procesar el cierre de caja. Verifique su conexión y reintente.');
    }
  };

  const isAdmin = user?.role === 'ADMIN';

  const ticketData: ShiftReceiptData | null = closeResult
    ? {
        shiftId: closeResult.shiftId,
        cajaName: closeResult.caja || currentShift.cashRegister?.name || 'Caja',
        cajaIdentifier: closeResult.cajaIdentifier || currentShift.cashRegister?.identifier,
        cashierName: closeResult.cashierName || user?.name || 'Cajero',
        openedAt: closeResult.openedAt || currentShift.openedAt,
        closedAt: closeResult.closedAt || new Date(),
        initialBalance:
          closeResult.initialBalance !== undefined
            ? closeResult.initialBalance
            : Number(currentShift.initialBalance) || 0,
        actualBalance:
          closeResult.actualBalance !== undefined
            ? closeResult.actualBalance
            : parseFloat(actualBalance) || 0,
        expectedBalance: closeResult.expectedBalance,
        difference: closeResult.difference,
        isBlindAudit: closeResult.isBlindAudit,
        salesCount: closeResult.salesCount,
        totalSales: closeResult.totalSales,
        cashFromSales: closeResult.cashFromSales,
        digitalFromSales: closeResult.digitalFromSales,
        incomeMovements: closeResult.incomeMovements,
        expenseMovements: closeResult.expenseMovements,
        soldProducts: closeResult.soldProducts || [],
        salesList: closeResult.salesList || [],
        notes: closeResult.notes || notes,
      }
    : null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative text-slate-100">
          <button
            onClick={handleFinalClose}
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

              <div className="flex flex-col sm:flex-row gap-3 mt-4 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTicketModal(true)}
                  className="w-full sm:w-1/2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold text-xs text-white shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir Ticket Térmico</span>
                </button>

                <button
                  type="button"
                  onClick={handleFinalClose}
                  className="w-full sm:w-1/2 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 font-semibold text-xs text-slate-300 transition-all cursor-pointer"
                >
                  Aceptar y Salir
                </button>
              </div>
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
                  {currentShift.cashRegister?.name} • Iniciada a las{' '}
                  {formatPeruTime(currentShift.openedAt)}
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
                      <strong className="text-white">el Fondo Inicial (base de {formatCurrency(currentShift.initialBalance)})</strong>{' '}
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

            {/* Alerta de ventas offline sin sincronizar antes de cerrar turno */}
            {(pendingCount > 0 || quarantinedCount > 0) && (
              <div className="mb-4 p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/35 text-rose-200 text-xs flex flex-col gap-2">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  <div>
                    <strong className="text-white block">
                      Hay {pendingCount + quarantinedCount} venta(s) offline pendientes de subir
                    </strong>
                    <span className="text-[11px] text-rose-200/90">
                      Sincronice primero sus ventas offline para que el sistema contabilice el efectivo exacto del turno y evite descuadres en el arqueo.
                    </span>
                  </div>
                </div>
                {isOnline && (
                  <button
                    type="button"
                    onClick={() => syncPendingSales(true)}
                    disabled={isSyncing}
                    className="self-end px-3 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-bold text-[11px] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar ventas ahora'}</span>
                  </button>
                )}
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
                    min="0"
                    step="0.01"
                    value={actualBalance}
                    onChange={(e) => setActualBalance(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    placeholder="0.00"
                    required
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 rounded-2xl pl-12 pr-4 py-3.5 text-xl font-extrabold text-white outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-slate-400">
                  Cuente todos los billetes y monedas que hay en el cajón (incluye la base de apertura de {formatCurrency(currentShift.initialBalance)}).
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

      <ShiftReceiptTicketModal
        isOpen={showTicketModal}
        onClose={() => setShowTicketModal(false)}
        shiftData={ticketData}
      />
    </>
  );
};
