import React, { useState } from 'react';
import { useShiftStore } from '../../store/useShiftStore.js';
import { apiRequest } from '../../api/client.js';
import { formatCurrency } from '../../lib/utils.js';
import { X, ArrowDownRight, ArrowUpRight, Coins, AlertCircle, CheckCircle } from 'lucide-react';
import type { CashMovementType } from '../../types/index.js';

interface CashMovementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const CashMovementModal: React.FC<CashMovementModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { activeShift, fetchActiveShift } = useShiftStore();
  const [type, setType] = useState<CashMovementType>('EXPENSE');
  const [amountStr, setAmountStr] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen || !activeShift) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amountStr);
    if (!numAmount || numAmount <= 0) {
      setError('Por favor ingrese un monto válido mayor a 0');
      return;
    }

    if (!reason.trim()) {
      setError('Por favor ingrese el motivo del movimiento');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      await apiRequest('/cash-shifts/movement', {
        method: 'POST',
        data: {
          shiftId: activeShift.id,
          type,
          amount: numAmount,
          reason: reason.trim(),
        },
      });

      setSuccessMsg(
        `${type === 'INCOME' ? 'Ingreso' : 'Egreso'} de ${formatCurrency(numAmount)} registrado correctamente`,
      );
      await fetchActiveShift();
      if (onSuccess) onSuccess();

      setTimeout(() => {
        setSuccessMsg(null);
        setAmountStr('');
        setReason('');
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Error al registrar el movimiento en caja');
    } finally {
      setIsLoading(false);
    }
  };

  const quickAmounts = [10, 20, 50, 100];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl relative text-slate-100">
        <button
          onClick={onClose}
          className="absolute right-5 top-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
          <Coins className="w-5 h-5 text-amber-400" />
          Movimiento Manual de Dinero
        </h3>
        <p className="text-xs text-slate-400 mb-5">
          Registre entradas de sencillo o salidas menores en {activeShift.cashRegister?.name}.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Selector de Tipo: Ingreso / Egreso */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Tipo de Movimiento:
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType('EXPENSE')}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                  type === 'EXPENSE'
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-sm shadow-rose-500/20'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                }`}
              >
                <ArrowDownRight className="w-4 h-4 text-rose-400" />
                Salida / Egreso
              </button>

              <button
                type="button"
                onClick={() => setType('INCOME')}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                  type === 'INCOME'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-500/20'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                }`}
              >
                <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                Ingreso / Entrada
              </button>
            </div>
          </div>

          {/* Input de Monto */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Monto en Efectivo (S/.):
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                S/.
              </span>
              <input
                type="number"
                step="0.10"
                min="0.10"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                onFocus={(e) => e.target.select()}
                placeholder="0.00"
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl pl-11 pr-4 py-2.5 text-base font-bold text-white placeholder-slate-600 outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                required
              />
            </div>

            <div className="flex items-center gap-1.5 mt-2">
              {quickAmounts.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setAmountStr(String(q))}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-slate-300 border border-slate-700/60 transition-all cursor-pointer"
                >
                  +{q}
                </button>
              ))}
            </div>
          </div>

          {/* Motivo */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Motivo o Justificación:
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                type === 'EXPENSE'
                  ? 'Ej: Pago delivery, compra de bolsas, etc.'
                  : 'Ej: Aporte inicial de monedas, cambio adicional'
              }
              className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition-all"
              required
            />
          </div>

          <div className="pt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-bold text-xs shadow-lg shadow-amber-600/30 transition-all cursor-pointer disabled:opacity-50"
            >
              {isLoading ? 'Registrando...' : 'Confirmar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
