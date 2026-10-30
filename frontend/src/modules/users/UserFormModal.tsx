import React, { useState, useEffect } from 'react';
import { X, User as UserIcon, Lock, KeyRound, Shield, AlertCircle, RefreshCw } from 'lucide-react';
import type { User, Role } from '../../types/index.js';
import { apiRequest } from '../../api/client.js';

interface UserFormModalProps {
  isOpen: boolean;
  userToEdit?: User | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const UserFormModal: React.FC<UserFormModalProps> = ({
  isOpen,
  userToEdit,
  onClose,
  onSuccess,
}) => {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('CAJERO');
  const [pin, setPin] = useState('');
  const [isActive, setIsActive] = useState(true);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = Boolean(userToEdit);

  useEffect(() => {
    if (userToEdit) {
      setName(userToEdit.name || '');
      setUsername(userToEdit.username || '');
      setPassword('');
      setRole(userToEdit.role || 'CAJERO');
      setPin('');
      setIsActive(userToEdit.isActive ?? true);
    } else {
      setName('');
      setUsername('');
      setPassword('');
      setRole('CAJERO');
      setPin('');
      setIsActive(true);
    }
    setError(null);
  }, [userToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setError(null);

    if (!name.trim()) {
      setError('El nombre completo es obligatorio.');
      return;
    }

    if (!username.trim()) {
      setError('El nombre de usuario es obligatorio.');
      return;
    }

    if (!isEditing && (!password || password.length < 6)) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (isEditing && password && password.length < 6) {
      setError('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (role === 'ADMIN' && pin && !/^\d{4,6}$/.test(pin.trim())) {
      setError('El PIN de administrador debe ser de 4 a 6 dígitos numéricos.');
      return;
    }

    setIsLoading(true);

    try {
      if (isEditing && userToEdit) {
        await apiRequest(`/users/${userToEdit.id}`, {
          method: 'PUT',
          data: {
            name: name.trim(),
            username: username.trim(),
            role,
            pin: role === 'ADMIN' ? pin.trim() || undefined : undefined,
            isActive,
          },
        });

        // Si se especificó una nueva contraseña al editar
        if (password && password.length >= 6) {
          await apiRequest(`/users/${userToEdit.id}/password`, {
            method: 'PUT',
            data: { newPassword: password },
          });
        }
      } else {
        await apiRequest('/users', {
          method: 'POST',
          data: {
            name: name.trim(),
            username: username.trim(),
            password,
            role,
            pin: role === 'ADMIN' ? pin.trim() || undefined : undefined,
          },
        });
      }

      onSuccess();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error al guardar el colaborador.');
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
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <UserIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">
                {isEditing ? 'Editar Colaborador' : 'Nuevo Colaborador / Cajero'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {isEditing
                  ? 'Modifique los datos o permisos del usuario seleccionado.'
                  : 'Registre un nuevo empleado para operar el punto de venta o administración.'}
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
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Nombre Completo *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Rodrigo Espejo o Carlos Mendoza"
              required
              className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition-all"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Usuario de Acceso *
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ej: rodrigo o cajero1"
                required
                className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition-all font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-slate-400" />
                Rol en el Sistema *
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none transition-all"
              >
                <option value="CAJERO">Cajero (Solo POS & Ventas)</option>
                <option value="ADMIN">Administrador (Acceso Total)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                {isEditing ? 'Nueva Contraseña (Opcional)' : 'Contraseña de Ingreso *'}
              </span>
              {isEditing && (
                <span className="text-[11px] text-slate-500">
                  Dejar vacío para mantener la actual
                </span>
              )}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isEditing ? '••••••••' : 'Mínimo 6 caracteres'}
              required={!isEditing}
              className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition-all"
            />
          </div>

          {/* PIN de Autorización (solo para administradores) */}
          {role === 'ADMIN' && (
            <div className="p-3.5 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-1.5">
              <label className="block text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                PIN Secreto de Autorización (4 a 6 dígitos)
              </label>
              <p className="text-[11px] text-slate-400 leading-tight">
                Utilizado para autorizar anulaciones de ventas y notas de crédito en los puntos de venta.
              </p>
              <input
                type="password"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder={isEditing ? 'Dejar vacío para mantener el actual' : 'Ej: 1234'}
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-3.5 py-2 text-sm text-amber-300 placeholder-slate-600 outline-none font-mono tracking-widest text-center"
              />
            </div>
          )}

          {/* Estado Activo / Inactivo al editar */}
          {isEditing && (
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950 border border-slate-800">
              <div>
                <div className="text-xs font-semibold text-white">Estado de la cuenta</div>
                <div className="text-[11px] text-slate-400">
                  {isActive ? 'El usuario puede iniciar sesión y operar.' : 'Acceso bloqueado al sistema.'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsActive(!isActive)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                  isActive ? 'bg-emerald-600' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isActive ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          )}

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
              disabled={isLoading}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-500/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <span>{isEditing ? 'Actualizar Colaborador' : 'Crear Colaborador'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
