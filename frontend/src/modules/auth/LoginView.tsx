import React, { useState } from 'react';
import { useAuthStore } from '../../store/useAuthStore.js';
import { Store, ShieldCheck, User as UserIcon, Lock, ArrowRight, AlertCircle, KeyRound, Headphones } from 'lucide-react';

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
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 p-4 sm:p-6 text-slate-100 relative">
      <div className="w-full max-w-md z-10">
        {/* Encabezado de la marca (Sobrio y Corporativo) */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm mb-3 text-slate-200">
            <Store className="w-7 h-7" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Comercial Rodrigo
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">
            Sistema de Ventas POS & Control de Inventario
          </p>
        </div>

        {/* Tarjeta de Login */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg sm:text-xl font-bold text-white">
              Iniciar Sesión
            </h2>
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-slate-700">
              v1.0
            </span>
          </div>
          <p className="text-xs text-slate-400 mb-6">
            Ingrese sus credenciales autorizadas para operar el punto de venta.
          </p>

          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2.5">
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
                  className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 transition-all outline-none"
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
                  className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 transition-all outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3 px-4 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition-all duration-150 flex items-center justify-center gap-2 group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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

          {/* Accesos rápidos */}
          <div className="mt-8 pt-6 border-t border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                Accesos de prueba rápidos:
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleQuickLogin('admin', 'admin123')}
                className="px-2 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-300 hover:text-white transition-all text-center cursor-pointer"
              >
                <div className="font-bold text-slate-200">Admin</div>
                <div className="text-[10px] text-slate-500">Acceso total</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('cajero1', 'cajero123')}
                className="px-2 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-300 hover:text-white transition-all text-center cursor-pointer"
              >
                <div className="font-bold text-emerald-400">Caja 1</div>
                <div className="text-[10px] text-slate-500">cajero1</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('cajero2', 'cajero123')}
                className="px-2 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-300 hover:text-white transition-all text-center cursor-pointer"
              >
                <div className="font-bold text-blue-400">Caja 2</div>
                <div className="text-[10px] text-slate-500">cajero2</div>
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

      {/* Botón Flotante Expansible de Soporte Técnico */}
      <a
        href="https://wa.me/51982383176?text=Hola%2C%20necesito%20soporte%20t%C3%A9cnico%20con%20el%20sistema%20Comercial%20Rodrigo."
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-50 flex items-center h-12 rounded-full bg-slate-900/95 hover:bg-slate-800 border border-slate-700/80 hover:border-emerald-500/50 shadow-2xl backdrop-blur-md transition-all duration-300 group hover:shadow-emerald-950/30 cursor-pointer overflow-hidden p-1 hover:pr-4"
        title="Soporte Técnico"
      >
        <div className="relative w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-all shrink-0">
          <Headphones className="w-5 h-5" />
          <span className="absolute top-0 right-0 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 border-2 border-slate-900"></span>
          </span>
        </div>

        <div className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 group-hover:max-w-xs group-hover:opacity-100 group-hover:ml-2.5 transition-all duration-300 ease-in-out">
          <span className="text-xs font-bold text-white tracking-wide">
            Soporte Técnico
          </span>
        </div>
      </a>
    </div>
  );
};
