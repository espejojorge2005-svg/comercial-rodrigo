import React, { useEffect, useState } from 'react';
import { useAuthStore } from './store/useAuthStore.js';
import { useShiftStore } from './store/useShiftStore.js';
import { LoginView } from './modules/auth/LoginView.js';
import { SelectRegisterView } from './modules/shifts/SelectRegisterView.js';
import { Navbar } from './components/layout/Navbar.js';
import { PosView } from './modules/pos/PosView.js';
import { InventoryView } from './modules/inventory/InventoryView.js';
import { ShiftAuditView } from './modules/shifts/ShiftAuditView.js';

export const App: React.FC = () => {
  const { user, token, initAuth } = useAuthStore();
  const { activeShift, fetchActiveShift, isLoading: shiftLoading } = useShiftStore();
  const [currentTab, setCurrentTab] = useState<string>('pos');
  const [isInitializing, setIsInitializing] = useState<boolean>(true);

  // Inicializar sesión almacenada al arrancar
  useEffect(() => {
    const initialize = async () => {
      await initAuth();
      setIsInitializing(false);
    };
    initialize();
  }, [initAuth]);

  // Si el usuario está autenticado, verificar si tiene turno activo
  useEffect(() => {
    if (token) {
      fetchActiveShift();
    }
  }, [token, fetchActiveShift]);

  // 1. Pantalla de Carga Inicial
  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-100 gap-3">
        <div className="w-10 h-10 border-3 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
        <span className="text-xs font-semibold text-slate-400">Cargando Comercial Rodrigo...</span>
      </div>
    );
  }

  // 2. Si no ha iniciado sesión -> Mostrar Login
  if (!token || !user) {
    return <LoginView />;
  }

  // 3. Si es Cajero y no tiene turno abierto en caja -> Selector de Caja y Apertura obligatorio
  const isAdmin = user.role === 'ADMIN';
  if (!activeShift && !shiftLoading && !isAdmin) {
    return <SelectRegisterView />;
  }

  // 4. Si es Admin o tiene turno activo -> Mostrar Sistema Completo con Navbar
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar currentTab={currentTab} onTabChange={setCurrentTab} />

      <main className="flex-1">
        {currentTab === 'pos' && (
          activeShift ? <PosView /> : <SelectRegisterView />
        )}
        {currentTab === 'inventory' && isAdmin && <InventoryView />}
        {currentTab === 'shifts' && isAdmin && <ShiftAuditView />}
      </main>
    </div>
  );
};

export default App;
