import React, { useState, useEffect } from 'react';
import {
  X,
  User as UserIcon,
  Lock,
  KeyRound,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Mail,
} from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore.js';
import { apiRequest } from '../../api/client.js';

interface AdminProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminProfileModal: React.FC<AdminProfileModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { user } = useAuthStore();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pin, setPin] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setUsername(user.username || '');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPin((user as any).pin || (user as any).rawPin || '');
    }
    setError(null);
    setSuccess(null);
  }, [user, isOpen]);

  if (!isOpen || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!name.trim()) {
      setError('El nombre no puede estar vacío.');
      return;
    }

    if (!username.trim()) {
      setError('El usuario o correo no puede estar vacío.');
      return;
    }

    if (newPassword) {
      if (!currentPassword) {
        setError('Debes ingresar tu contraseña actual para cambiarla.');
        return;
      }
      if (newPassword.length < 6) {
        setError('La nueva contraseña debe tener al menos 6 caracteres.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setError('La confirmación de la nueva contraseña no coincide.');
        return;
      }
    }

    if (pin && !/^\d{4,6}$/.test(pin.trim())) {
      setError('El PIN de administrador debe ser de 4 a 6 dígitos numéricos.');
      return;
    }

    setIsLoading(true);

    try {
      const payload: any = {
        name: name.trim(),
        username: username.trim(),
        pin: pin.trim() || undefined,
      };

      if (newPassword) {
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
      }

      const updatedUser = await apiRequest('/auth/profile', {
        method: 'PUT',
        data: payload,
      });

      // Actualizar estado local del usuario autenticado
      localStorage.setItem('auth_user', JSON.stringify(updatedUser));
      useAuthStore.setState({ user: updatedUser });

      setSuccess('¡Perfil de administrador actualizado con éxito!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      setTimeout(() => {
        setSuccess(null);
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error al actualizar el perfil.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden">
        {/* Cabecera */}
        <div className="p-4 sm:p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Mi Perfil de Administrador
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Dueño
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Configure su nombre, usuario/correo, contraseña y PIN definitivo para producción.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{success}</span>
            </div>
          )}

          {/* Nombre y Usuario */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                Nombre del Titular / Administrador *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Jorge Espejo"
                required
                className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                Usuario o Correo de Acceso *
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ej: jorge o tu_correo@gmail.com"
                required
                className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition-all font-mono"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Con este nombre o correo iniciarás sesión en el sistema.
              </p>
            </div>
          </div>

          {/* PIN de Autorizaciones */}
          <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-amber-400" />
                PIN Maestro de Autorización
              </label>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300">
                4-6 dígitos
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-tight">
              Este PIN lo usarás en los puntos de venta para autorizar anulaciones de tickets o notas de crédito sin cerrar la sesión del cajero.
            </p>
            <input
              type="password"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="Ej: 1234"
              className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-3.5 py-2 text-base text-amber-300 placeholder-slate-600 outline-none font-mono tracking-widest text-center"
            />
          </div>

          {/* Sección Cambio de Contraseña */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-slate-400" />
              <h3 className="text-xs font-bold text-white">Cambiar Contraseña de Ingreso</h3>
              <span className="text-[10px] text-slate-500">(Opcional)</span>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Contraseña Actual:
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Ingresa tu clave actual (ej: admin123)"
                className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Nueva Contraseña:
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Repetir Nueva:
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repite la clave"
                  className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Botones */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading || Boolean(success)}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-500/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Guardando Cambios...</span>
                </>
              ) : (
                <span>Guardar Credenciales Definitivas</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
