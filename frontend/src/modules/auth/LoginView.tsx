import React, { useState } from 'react';
import { useAuthStore } from '../../store/useAuthStore.js';
import { Store, ShieldCheck, User as UserIcon, Lock, ArrowRight, Sparkles, AlertCircle } from 'lucide-react';

export const LoginView: React.FC = () => {
  const { login, isLoading, error } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    await login(username, password);
  };

  const handleQuickLogin = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-4 sm:p-6 text-slate-100 relative overflow-hidden">
      {/* Luces de fondo decorativas */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md z-10">
        {/* Encabezado de la marca */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-blue-500 shadow-lg shadow-indigo-500/25 mb-4 ring-1 ring-white/20">
            <Store className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            Comercial Rodrigo
          </h1>
          <p className="text-sm text-slate-400 mt-1 font-medium">
            Punto de Venta Multi-Caja & Control de Inventario
          </p>
        </div>

        {/* Tarjeta de Login */}
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/50">
          <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
            Iniciar Sesión
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              v1.0
            </span>
          </h2>
          <p className="text-xs text-slate-400 mb-6">
            Ingrese sus credenciales para acceder a la caja o administración.
          </p>

          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2.5 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Usuario
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ej. admin o cajero1"
                  required
                  className="w-full bg-slate-950/60 border border-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 transition-all outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full bg-slate-950/60 border border-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 transition-all outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3 px-4 rounded-xl font-semibold text-sm bg-gradient-to-r from-indigo-600 via-indigo-500 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white shadow-lg shadow-indigo-600/30 transition-all duration-200 flex items-center justify-center gap-2 group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Ingresar al Sistema</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* Accesos rápidos para desarrollo y pruebas */}
          <div className="mt-8 pt-6 border-t border-slate-800/80">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Cuentas de prueba rápidas:
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleQuickLogin('admin', 'admin123')}
                className="px-2.5 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-xs font-medium text-slate-300 hover:text-white transition-all text-center"
              >
                <div className="font-semibold text-indigo-400">Admin</div>
                <div className="text-[10px] text-slate-400">Acceso total</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('cajero1', 'cajero123')}
                className="px-2.5 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-xs font-medium text-slate-300 hover:text-white transition-all text-center"
              >
                <div className="font-semibold text-emerald-400">Caja 1</div>
                <div className="text-[10px] text-slate-400">cajero1</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('cajero2', 'cajero123')}
                className="px-2.5 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-xs font-medium text-slate-300 hover:text-white transition-all text-center"
              >
                <div className="font-semibold text-blue-400">Caja 2</div>
                <div className="text-[10px] text-slate-400">cajero2</div>
              </button>
            </div>
          </div>
        </div>

        {/* Pie de página */}
        <p className="text-center text-xs text-slate-500 mt-6 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          Conexión segura y concurrente con PostgreSQL en Supabase
        </p>
      </div>
    </div>
  );
};
