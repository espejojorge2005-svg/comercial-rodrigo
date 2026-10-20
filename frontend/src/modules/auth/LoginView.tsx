import React, { useState } from 'react';
import { useAuthStore } from '../../store/useAuthStore.js';
import {
  ShieldCheck,
  User as UserIcon,
  Lock,
  ArrowRight,
  AlertCircle,
  KeyRound,
  Headphones,
  RefreshCw,
  Eye,
  EyeOff,
  FileText,
  X,
  CheckCircle2,
} from 'lucide-react';

export const LoginView: React.FC = () => {
  const { login, isLoading, error } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [policyModal, setPolicyModal] = useState<'privacy' | 'terms' | null>(null);

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
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 p-4 sm:p-6 text-slate-100 relative selection:bg-blue-600 selection:text-white">
      <div className="w-full max-w-md z-10 py-6">
        {/* Encabezado Corporativo Formal */}
        <div className="text-center mb-7">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white border border-slate-700/80 shadow-2xl shadow-orange-500/10 mb-3.5 p-2.5 overflow-hidden ring-4 ring-orange-500/10 transition-transform duration-300 hover:scale-105">
            <img
              src="/logo-icon.png"
              alt="Comercial Rodrigo"
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Comercial Rodrigo
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">
            Sistema de Ventas POS & Control de Inventario
          </p>
        </div>

        {/* Tarjeta de Inicio de Sesión */}
        <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/60 relative">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
              Iniciar Sesión
            </h2>
            <span className="text-[10px] font-mono font-semibold px-2.5 py-0.5 rounded-full bg-slate-800/80 text-slate-400 border border-slate-700/60">
              v1.0
            </span>
          </div>
          <p className="text-xs text-slate-400 mb-6 leading-relaxed">
            Ingrese sus credenciales autorizadas para operar el punto de venta.
          </p>

          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex flex-col gap-2 animate-in fade-in duration-200">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
              <button
                type="button"
                onClick={(e) => handleSubmit(e)}
                className="self-end inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-[11px] font-semibold transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                Reintentar conexión
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Usuario
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ej. admin o cajero1"
                  required
                  autoComplete="username"
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 transition-all outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl pl-10 pr-11 py-2.5 text-sm text-white placeholder-slate-500 transition-all outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  tabIndex={-1}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors p-1 rounded-md focus:outline-none cursor-pointer"
                  title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-3 py-3 px-4 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white shadow-lg shadow-blue-600/20 transition-all duration-150 flex items-center justify-center gap-2 group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Ingresar al Sistema</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* Accesos rápidos */}
          <div className="mt-7 pt-5 border-t border-slate-800/80">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                Accesos de prueba rápidos:
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleQuickLogin('admin', 'admin123')}
                className="px-2 py-2 rounded-xl bg-slate-950/70 hover:bg-slate-800/90 border border-slate-800/80 hover:border-slate-700 text-xs font-medium text-slate-300 hover:text-white transition-all text-center cursor-pointer shadow-sm"
              >
                <div className="font-bold text-slate-200">Admin</div>
                <div className="text-[10px] text-slate-500">Acceso total</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('cajero1', 'cajero123')}
                className="px-2 py-2 rounded-xl bg-slate-950/70 hover:bg-slate-800/90 border border-slate-800/80 hover:border-slate-700 text-xs font-medium text-slate-300 hover:text-white transition-all text-center cursor-pointer shadow-sm"
              >
                <div className="font-bold text-emerald-400">Caja 1</div>
                <div className="text-[10px] text-slate-500">cajero1</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('cajero2', 'cajero123')}
                className="px-2 py-2 rounded-xl bg-slate-950/70 hover:bg-slate-800/90 border border-slate-800/80 hover:border-slate-700 text-xs font-medium text-slate-300 hover:text-white transition-all text-center cursor-pointer shadow-sm"
              >
                <div className="font-bold text-blue-400">Caja 2</div>
                <div className="text-[10px] text-slate-500">cajero2</div>
              </button>
            </div>
          </div>
        </div>

        {/* Pie de página institucional y políticas */}
        <div className="text-center mt-6 space-y-3">
          <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Acceso Seguro y Transacciones Auditadas</span>
          </div>

          <div className="flex items-center justify-center gap-3 text-[11px] text-slate-400">
            <button
              type="button"
              onClick={() => setPolicyModal('privacy')}
              className="hover:text-white transition-colors underline-offset-4 hover:underline cursor-pointer"
            >
              Políticas de Privacidad
            </button>
            <span className="text-slate-600">•</span>
            <button
              type="button"
              onClick={() => setPolicyModal('terms')}
              className="hover:text-white transition-colors underline-offset-4 hover:underline cursor-pointer"
            >
              Términos de Operación POS
            </button>
          </div>

          <p className="text-[11px] text-slate-500">
            © {new Date().getFullYear()} Comercial Rodrigo. Todos los derechos reservados.
          </p>
        </div>
      </div>

      {/* Modal Institucional de Políticas */}
      {policyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl relative text-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-blue-400" />
                <h3 className="text-base sm:text-lg font-bold text-white">
                  {policyModal === 'privacy'
                    ? 'Política de Privacidad y Confidencialidad'
                    : 'Términos de Operación y Seguridad POS'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPolicyModal(null)}
                className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-4 text-xs sm:text-sm text-slate-300 leading-relaxed">
              {policyModal === 'privacy' ? (
                <>
                  <p>
                    En <strong>Comercial Rodrigo</strong>, la protección de los datos comerciales y de los clientes es una prioridad institucional, en cumplimiento con la <strong>Ley N° 29733 de Protección de Datos Personales del Perú</strong>:
                  </p>
                  <ul className="space-y-2 list-none pl-0">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span><strong>Datos de Clientes:</strong> Los DNI, RUC, nombres y direcciones ingresados para la emisión de comprobantes fiscales (Boletas y Facturas) se procesan estrictamente con fines tributarios para SUNAT.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span><strong>Confidencialidad Comercial:</strong> Los costos de adquisición, márgenes de utilidad y reportes gerenciales son de acceso exclusivo para la administración y no deben ser divulgados a terceros.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span><strong>Trazabilidad:</strong> Cada inicio de sesión y operación efectuada queda registrada en el sistema con fecha, hora e identificación del usuario responsable.</span>
                    </li>
                  </ul>
                </>
              ) : (
                <>
                  <p>
                    Términos y condiciones obligatorios para todos los colaboradores con acceso al sistema <strong>Comercial Rodrigo POS</strong>:
                  </p>
                  <ul className="space-y-2 list-none pl-0">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                      <span><strong>Credenciales Intransferibles:</strong> Las cuentas de usuario, contraseñas y PIN de supervisor son estrictamente personales. Compartirlos está prohibido.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                      <span><strong>Arqueo y Cierre de Caja:</strong> Cada cajero es responsable de custodiar el dinero físico ingresado durante su turno. Los cierres se efectúan bajo la modalidad de arqueo ciego para auditoría gerencial.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                      <span><strong>Anulaciones y Devoluciones:</strong> Toda anulación de venta o emisión de Nota de Crédito requiere obligatoriamente la autorización física del Administrador mediante PIN de seguridad.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                      <span><strong>Control de Inventario (Kardex):</strong> Todo movimiento de mercadería descuenta o restituye stock automáticamente en tiempo real.</span>
                    </li>
                  </ul>
                </>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setPolicyModal(null)}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 font-semibold text-xs text-white transition-colors cursor-pointer"
              >
                Entendido y de Acuerdo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Botón Flotante Expansible de Soporte Técnico */}
      <a
        href="https://wa.me/51982383176?text=Hola%2C%20necesito%20soporte%20t%C3%A9cnico%20con%20el%20sistema%20Comercial%20Rodrigo."
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-40 flex items-center h-12 rounded-full bg-slate-900/95 hover:bg-slate-800 border border-slate-700/80 hover:border-emerald-500/50 shadow-2xl backdrop-blur-md transition-all duration-300 group hover:shadow-emerald-950/30 cursor-pointer overflow-hidden p-1 hover:pr-4"
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
