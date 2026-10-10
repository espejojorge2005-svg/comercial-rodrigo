import { create } from 'zustand';
import type { CashRegister, CashShift, CashMovementType } from '../types/index.js';
import { apiRequest } from '../api/client.js';
import { offlineStorage } from '../lib/offlineStorage.js';

interface ShiftState {
  activeShift: CashShift | null;
  registers: CashRegister[];
  isLoading: boolean;
  error: string | null;

  fetchRegisters: () => Promise<void>;
  fetchActiveShift: () => Promise<CashShift | null>;
  openShift: (cashRegisterId: string, initialBalance: number, notes?: string) => Promise<boolean>;
  closeShift: (actualBalance: number, notes?: string) => Promise<any>;
  registerMovement: (type: CashMovementType, amount: number, reason: string) => Promise<boolean>;
}

export const useShiftStore = create<ShiftState>((set, get) => ({
  activeShift: null,
  registers: [],
  isLoading: false,
  error: null,

  fetchRegisters: async () => {
    try {
      const data = await apiRequest<CashRegister[]>('/cash-shifts/registers');
      set({ registers: data });
    } catch (err: any) {
      console.error('Error fetching registers:', err);
    }
  },

  fetchActiveShift: async () => {
    set({ isLoading: true });
    try {
      const data = await apiRequest<CashShift | null>('/cash-shifts/active');
      set({ activeShift: data, isLoading: false });
      // Guardar en caché offline para asegurar continuidad si se va la red
      await offlineStorage.cacheActiveShift(data);
      return data;
    } catch (err: any) {
      // Si la petición falla (offline), recuperar el turno en caché local para no bloquear la caja
      const cached = await offlineStorage.getCachedActiveShift();
      if (cached) {
        set({ activeShift: cached, isLoading: false });
        return cached;
      }
      set({ activeShift: null, isLoading: false });
      return null;
    }
  },

  openShift: async (cashRegisterId: string, initialBalance: number, notes?: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await apiRequest<{ message: string; shift: CashShift }>('/cash-shifts/open', {
        method: 'POST',
        data: { cashRegisterId, initialBalance, notes },
      });

      set({ activeShift: res.shift, isLoading: false });
      await offlineStorage.cacheActiveShift(res.shift);
      await get().fetchRegisters();
      return true;
    } catch (err: any) {
      set({ isLoading: false, error: err.message || 'Error al aperturar turno' });
      return false;
    }
  },

  closeShift: async (actualBalance: number, notes?: string) => {
    const shift = get().activeShift;
    if (!shift) throw new Error('No hay turno activo para cerrar');

    set({ isLoading: true, error: null });
    try {
      const res = await apiRequest('/cash-shifts/close', {
        method: 'POST',
        data: {
          shiftId: shift.id,
          actualBalance,
          notes,
        },
      });

      set({ activeShift: null, isLoading: false });
      await offlineStorage.cacheActiveShift(null);
      await get().fetchRegisters();
      return res;
    } catch (err: any) {
      set({ isLoading: false, error: err.message || 'Error al cerrar turno' });
      throw err;
    }
  },

  registerMovement: async (type: CashMovementType, amount: number, reason: string) => {
    const shift = get().activeShift;
    if (!shift) return false;

    set({ isLoading: true, error: null });
    try {
      await apiRequest('/cash-shifts/movement', {
        method: 'POST',
        data: {
          shiftId: shift.id,
          type,
          amount,
          reason,
        },
      });

      // Refrescar turno activo para ver los nuevos montos
      await get().fetchActiveShift();
      return true;
    } catch (err: any) {
      set({ isLoading: false, error: err.message || 'Error al registrar movimiento' });
      return false;
    }
  },
}));
