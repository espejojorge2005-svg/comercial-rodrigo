import React, { useEffect, useState } from 'react';
import { useShiftStore } from '../../store/useShiftStore.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { formatCurrency } from '../../lib/utils.js';
import {
  CreditCard,
  LogOut,
  ShieldAlert,
  Coins,
  CheckCircle2,
  Clock,
  User,
  AlertCircle,
  ArrowRight,
  Store,
} from 'lucide-react';

export const SelectRegisterView: React.FC = () => {
  const { user, logout } = useAuthStore();
  const { registers, fetchRegisters, openShift, isLoading, error } = useShiftStore();

  const [selectedRegisterId, setSelectedRegisterId] = useState<string>('');
  const [initialBalance, setInitialBalance] = useState<number>(100);
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    fetchRegisters();
  }, [fetchRegisters]);

  // Pre-seleccionar la primera caja disponible
  useEffect(() => {
    if (registers.length > 0 && !selectedRegisterId) {
      const firstAvailable = registers.find((r) => r.isAvailable);
      if (firstAvailable) {
        setSelectedRegisterId(firstAvailable.id);
      }
    }
  }, [registers, selectedRegisterId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRegisterId) return;
    await openShift(selectedRegisterId, Number(initialBalance), notes);
  };

  const quickAmounts = [50, 100, 150, 200, 300];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-8 relative">
      {/* Barra superior con usuario y cerrar sesión */}
      <header className="max-w-4xl mx-auto w-full flex items-center justify-between py-2 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white">Comercial Rodrigo</h1>
            <p className="text-xs text-slate-400">Apertura de Turno de Cobro</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col text-right">
            <span className="text-xs font-semibold text-slate-200">{user?.name}</span>
            <span className="text-[10px] text-indigo-400 font-medium tracking-wider uppercase">
              {user?.role}
            </span>
          </div>
          <button
            onClick={logout}
            className="p-2 sm:px-3 sm:py-1.5 rounded-lg bg-slate-900 hover:bg-rose-950/40 border border-slate-800 hover:border-rose-500/30 text-slate-400 hover:text-rose-400 text-xs font-medium flex items-center gap-2 transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Cerrar Sesión</span>
          </button>
        </div>
      </header>

      {/* Contenido Central */}
      <main className="max-w-2xl mx-auto w-full my-auto py-8">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Selecciona tu Punto de Cobro
          </h2>
          <p className="text-sm text-slate-400 mt-2">
            Elige una de las 2 cajas físicas disponibles e indica el fondo inicial en efectivo
            para iniciar tu jornada.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Selección de Cajas Físicas */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">
              1. Cajas Físicas Registradas
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {registers.map((reg) => {
                const isSelected = selectedRegisterId === reg.id;
                const isAvailable = reg.isAvailable;

                return (
                  <div
                    key={reg.id}
                    onClick={() => {
                      if (isAvailable) setSelectedRegisterId(reg.id);
                    }}
                    className={`relative rounded-2xl p-5 border transition-all text-left ${
                      isAvailable
                        ? isSelected
                          ? 'bg-indigo-600/15 border-indigo-500 ring-2 ring-indigo-500/30 shadow-lg shadow-indigo-600/10 cursor-pointer'
                          : 'bg-slate-900/80 hover:bg-slate-800/80 border-slate-800 hover:border-slate-700 cursor-pointer'
                        : 'bg-slate-900/30 border-slate-900/80 opacity-60 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          isSelected
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        <CreditCard className="w-5 h-5" />
                      </div>

                      {isAvailable ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Disponible
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/20">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          En Uso
                        </span>
                      )}
                    </div>

                    <h3 className="text-lg font-bold text-white">{reg.name}</h3>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">{reg.identifier}</p>

                    {!isAvailable && reg.activeShift && (
                      <div className="mt-3 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 space-y-1">
                        <div className="flex items-center gap-1.5 text-slate-300">
                          <User className="w-3 h-3 text-amber-400" />
                          <span>Cajero: {reg.activeShift.user.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-400">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span>
                            Abierta: {new Date(reg.activeShift.openedAt).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Monto Inicial en Efectivo */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                <Coins className="w-4 h-4 text-amber-400" />
                2. Monto Base Inicial en Gaveta (S/.)
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-base">
                  S/.
                </span>
                <input
                  type="number"
                  step="0.10"
                  min="0"
                  value={initialBalance}
                  onChange={(e) => setInitialBalance(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  required
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl pl-12 pr-4 py-3 text-lg font-bold text-white outline-none transition-all"
                />
              </div>
            </div>

            {/* Chips de montos rápidos */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">Montos sugeridos:</span>
              {quickAmounts.map((amt) => (
                <button
                  type="button"
                  key={amt}
                  onClick={() => setInitialBalance(amt)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                    initialBalance === amt
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-slate-800/80 hover:bg-slate-800 border-slate-700/80 text-slate-300'
                  }`}
                >
                  {formatCurrency(amt)}
                </button>
              ))}
            </div>

            {/* Notas opcionales */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Observaciones iniciales (opcional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ej. Billetes de 20 y monedas sueltas para vuelto"
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2 text-xs text-white placeholder-slate-500 outline-none"
              />
            </div>
          </div>

          {/* Botón de Apertura */}
          <button
            type="submit"
            disabled={isLoading || !selectedRegisterId}
            className="w-full py-4 px-6 rounded-2xl font-bold text-base bg-gradient-to-r from-indigo-600 via-indigo-500 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white shadow-xl shadow-indigo-600/25 transition-all flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>Aperturar Turno e Ingresar al Punto de Venta</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>
      </main>

      {/* Pie de pantalla */}
      <footer className="text-center text-xs text-slate-500 py-4 border-t border-slate-900">
        Comercial Rodrigo • Soporte de 2 Cajas Físicas Simultáneas con Concurrencia ACID
      </footer>
    </div>
  );
};
