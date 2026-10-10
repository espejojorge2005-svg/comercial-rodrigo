import React, { useState } from 'react';
import { useAuthStore } from '../../store/useAuthStore.js';
import { useShiftStore } from '../../store/useShiftStore.js';
import { useConfigStore } from '../../store/useConfigStore.js';
import { CloseShiftModal } from '../../modules/shifts/CloseShiftModal.js';
import { StoreSettingsModal } from '../../modules/settings/StoreSettingsModal.js';
import {
  Store,
  ShoppingCart,
  Package,
  History,
  Settings,
  LogOut,
  Lock,
  User as UserIcon,
} from 'lucide-react';

interface NavbarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, onTabChange }) => {
  const { user, logout } = useAuthStore();
  const { activeShift } = useShiftStore();
  const { config } = useConfigStore();
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  const isAdmin = user?.role === 'ADMIN';

  return (
    <>
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 text-slate-100">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-4">
          {/* Logo y Caja Activa */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700/80 flex items-center justify-center text-slate-200 shadow-sm">
                <Store className="w-5 h-5" />
              </div>
              <div className="hidden sm:block">
                <div className="text-sm font-extrabold tracking-tight text-white leading-none">
                  {config.name}
                </div>
                <div className="text-[10px] text-slate-400 font-medium">
                  {config.subtitle || 'Sistema POS & Kardex'}
                </div>
              </div>
            </div>

            {/* Badge de Caja Activa */}
            {activeShift?.cashRegister && (
              <div className="flex items-center gap-1.5 sm:gap-2 px-2 py-1 rounded-xl bg-slate-800/80 border border-slate-700/80 text-xs">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="font-bold text-white text-xs whitespace-nowrap">
                  {activeShift.cashRegister.name}
                </span>
                <span className="hidden md:inline text-[10px] text-slate-400 font-mono">
                  ({activeShift.cashRegister.identifier})
                </span>
              </div>
            )}
          </div>

          {/* Menú de Navegación por Pestañas */}
          <nav className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto scrollbar-none py-1">
            <button
              onClick={() => onTabChange('pos')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                currentTab === 'pos'
                  ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <ShoppingCart className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">POS Caja</span>
              <span className="sm:hidden">POS</span>
            </button>

            {isAdmin && (
              <>
                <button
                  onClick={() => onTabChange('inventory')}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                    currentTab === 'inventory'
                      ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Kardex & Stock</span>
                  <span className="sm:hidden">Kardex</span>
                </button>

                <button
                  onClick={() => onTabChange('shifts')}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                    currentTab === 'shifts'
                      ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <History className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden md:inline">Auditoría Cajas</span>
                  <span className="md:hidden">Auditoría</span>
                </button>

                <button
                  onClick={() => setIsSettingsModalOpen(true)}
                  className="px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap text-slate-400 hover:text-white hover:bg-slate-800/60"
                  title="Configurar RUC, Dirección y Membrete de Tickets"
                >
                  <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden lg:inline">Configuración</span>
                </button>
              </>
            )}
          </nav>

          {/* Acciones de Usuario y Turno */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {/* Botón de Cierre de Caja */}
            {activeShift && (
              <button
                onClick={() => setIsCloseModalOpen(true)}
                className="px-2 sm:px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-1 sm:gap-1.5 transition-all cursor-pointer"
                title="Cerrar turno y realizar arqueo de dinero"
              >
                <Lock className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cerrar Turno</span>
              </button>
            )}

            {/* Perfil */}
            <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-slate-800">
              <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300">
                <UserIcon className="w-4 h-4" />
              </div>
              <div className="text-left">
                <div className="text-xs font-bold text-white leading-none">{user?.name}</div>
                <div className="text-[10px] text-slate-400 uppercase font-semibold">
                  {user?.role}
                </div>
              </div>
            </div>

            {/* Salir */}
            <button
              onClick={logout}
              className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 transition-all cursor-pointer"
              title="Cerrar Sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Modal de Cierre de Caja */}
      <CloseShiftModal
        isOpen={isCloseModalOpen}
        onClose={() => setIsCloseModalOpen(false)}
      />

      {/* Modal de Configuración de Tienda y Tickets */}
      <StoreSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
      />
    </>
  );
};
