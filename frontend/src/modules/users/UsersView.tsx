import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  UserPlus,
  ShieldCheck,
  UserCheck,
  KeyRound,
  Edit2,
  Power,
  Search,
  RefreshCw,
  AlertCircle,
  Clock,
  ShoppingCart,
} from 'lucide-react';
import type { User } from '../../types/index.js';
import { apiRequest } from '../../api/client.js';
import { UserFormModal } from './UserFormModal.js';
import { ChangePasswordModal } from './ChangePasswordModal.js';
import { formatPeruDateTime } from '../../lib/utils.js';

export const UsersView: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Modales
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<User | null>(null);
  const [passwordModalUser, setPasswordModalUser] = useState<User | null>(null);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiRequest<User[]>('/users');
      setUsers(data || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error al cargar la lista de colaboradores.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleToggleStatus = async (user: User) => {
    const newStatus = !user.isActive;
    const confirmMessage = newStatus
      ? `¿Deseas activar la cuenta de "${user.name}"? Podrá volver a iniciar sesión.`
      : `¿Estás seguro de desactivar la cuenta de "${user.name}"? Ya no podrá ingresar al sistema.`;

    if (!window.confirm(confirmMessage)) return;

    try {
      await apiRequest(`/users/${user.id}`, {
        method: 'PUT',
        data: { isActive: newStatus },
      });
      fetchUsers();
    } catch (err: any) {
      alert(`No se pudo cambiar el estado: ${err.message || err}`);
    }
  };

  const filteredUsers = users.filter((u) => {
    const query = searchTerm.toLowerCase().trim();
    if (!query) return true;
    return (
      u.name.toLowerCase().includes(query) ||
      u.username.toLowerCase().includes(query) ||
      u.role.toLowerCase().includes(query)
    );
  });

  const totalUsers = users.length;
  const totalAdmins = users.filter((u) => u.role === 'ADMIN').length;
  const totalActiveCashiers = users.filter((u) => u.role === 'CAJERO' && u.isActive).length;
  const totalInactive = users.filter((u) => !u.isActive).length;

  return (
    <div className="w-full max-w-[1700px] mx-auto p-3 sm:p-6 space-y-6">
      {/* Encabezado Principal */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-white flex items-center gap-2">
                Personal & Gestión de Usuarios
                <span className="text-[10px] font-mono font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Seguridad
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Cree y administre las cuentas de cajeros y colaboradores que operan el sistema de Comercial Rodrigo.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-start md:self-auto">
          <button
            onClick={fetchUsers}
            disabled={isLoading}
            className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition-all cursor-pointer"
            title="Refrescar colaboradores"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => {
              setUserToEdit(null);
              setIsFormModalOpen(true);
            }}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-500/20 transition-all cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Nuevo Colaborador</span>
          </button>
        </div>
      </div>

      {/* Tarjetas Estadísticas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Total Colaboradores</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-extrabold text-white">{totalUsers}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">En el sistema</div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Administradores</span>
            <ShieldCheck className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold text-amber-400">{totalAdmins}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Acceso gerencial total</div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Cajeros Activos</span>
            <UserCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-400">{totalActiveCashiers}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Operando cajas POS</div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Cuentas Bloqueadas</span>
            <Power className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-extrabold text-rose-400">{totalInactive}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Sin acceso al sistema</div>
        </div>
      </div>

      {/* Barra de Búsqueda y Filtros */}
      <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-900 border border-slate-800">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nombre o usuario..."
            className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl pl-9 pr-3.5 py-2 text-xs text-white placeholder-slate-500 outline-none"
          />
        </div>
        <div className="text-xs text-slate-400 hidden sm:block">
          Mostrando <strong>{filteredUsers.length}</strong> de {users.length} usuarios
        </div>
      </div>

      {/* Error si ocurre */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Tabla de Usuarios */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-semibold">
              <tr>
                <th className="p-3.5 pl-6">Colaborador</th>
                <th className="p-3.5">Usuario de Ingreso</th>
                <th className="p-3.5">Rol</th>
                <th className="p-3.5">PIN Autorización</th>
                <th className="p-3.5 text-center">Turnos / Ventas</th>
                <th className="p-3.5 text-center">Estado</th>
                <th className="p-3.5 text-center">Registrado</th>
                <th className="p-3.5 text-right pr-6">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2.5">
                      <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                      <span>Cargando colaboradores...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    No se encontraron colaboradores con el término de búsqueda.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const initials = u.name
                    ? u.name
                        .split(' ')
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase()
                    : 'U';

                  return (
                    <tr
                      key={u.id}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        !u.isActive ? 'opacity-60 bg-slate-950/40' : ''
                      }`}
                    >
                      {/* Colaborador con Avatar */}
                      <td className="p-3.5 pl-6">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                              u.role === 'ADMIN'
                                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                : 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                            }`}
                          >
                            {initials}
                          </div>
                          <div>
                            <div className="font-bold text-white text-sm leading-tight flex items-center gap-1.5">
                              {u.name}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              ID: {u.id.substring(0, 8)}...
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Usuario de Ingreso */}
                      <td className="p-3.5">
                        <span className="font-mono text-slate-200 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 text-[11px]">
                          {u.username}
                        </span>
                      </td>

                      {/* Rol */}
                      <td className="p-3.5">
                        {u.role === 'ADMIN' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/25 text-[11px] font-semibold">
                            <ShieldCheck className="w-3.5 h-3.5" /> Administrador
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-300 border border-blue-500/25 text-[11px] font-semibold">
                            <UserCheck className="w-3.5 h-3.5" /> Cajero
                          </span>
                        )}
                      </td>

                      {/* PIN de Autorización */}
                      <td className="p-3.5">
                        {u.role === 'ADMIN' ? (
                          <span className="inline-flex items-center gap-1 font-mono text-amber-300/90 text-xs">
                            <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                            {u.pin || '••••'}
                          </span>
                        ) : (
                          <span className="text-slate-500 text-xs">—</span>
                        )}
                      </td>

                      {/* Métricas Turnos / Ventas */}
                      <td className="p-3.5 text-center">
                        <div className="inline-flex items-center gap-2 text-[11px] text-slate-400">
                          <span title="Turnos de caja completados" className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-500" /> {u.shiftsCount || 0}
                          </span>
                          <span>•</span>
                          <span title="Ventas realizadas" className="flex items-center gap-1 text-emerald-400/90">
                            <ShoppingCart className="w-3 h-3" /> {u.salesCount || 0}
                          </span>
                        </div>
                      </td>

                      {/* Estado */}
                      <td className="p-3.5 text-center">
                        {u.isActive ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 text-[11px] font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            Activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-[11px] font-medium">
                            Inactivo
                          </span>
                        )}
                      </td>

                      {/* Fecha de Registro */}
                      <td className="p-3.5 text-center text-slate-400 text-[11px] font-mono">
                        {u.createdAt ? formatPeruDateTime(u.createdAt).split(' ')[0] : '—'}
                      </td>

                      {/* Acciones */}
                      <td className="p-3.5 pr-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Cambiar Clave Rápida */}
                          <button
                            type="button"
                            onClick={() => setPasswordModalUser(u)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 transition-colors cursor-pointer"
                            title="Cambiar contraseña"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>

                          {/* Editar Datos */}
                          <button
                            type="button"
                            onClick={() => {
                              setUserToEdit(u);
                              setIsFormModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-blue-500/20 text-slate-300 hover:text-blue-300 transition-colors cursor-pointer"
                            title="Editar colaborador"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Activar / Desactivar */}
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(u)}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              u.isActive
                                ? 'bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400'
                                : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                            }`}
                            title={u.isActive ? 'Desactivar cuenta' : 'Activar cuenta'}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Crear / Editar */}
      <UserFormModal
        isOpen={isFormModalOpen}
        userToEdit={userToEdit}
        onClose={() => {
          setIsFormModalOpen(false);
          setUserToEdit(null);
        }}
        onSuccess={() => {
          setIsFormModalOpen(false);
          setUserToEdit(null);
          fetchUsers();
        }}
      />

      {/* Modal Cambiar Contraseña */}
      <ChangePasswordModal
        isOpen={Boolean(passwordModalUser)}
        user={passwordModalUser}
        onClose={() => setPasswordModalUser(null)}
        onSuccess={() => {
          setPasswordModalUser(null);
          fetchUsers();
        }}
      />
    </div>
  );
};
