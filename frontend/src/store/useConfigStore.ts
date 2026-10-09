import { create } from 'zustand';
import { apiRequest } from '../api/client.js';
import type { StoreConfig } from '../types/index.js';

interface ConfigState {
  config: StoreConfig;
  isLoading: boolean;
  error: string | null;

  fetchConfig: () => Promise<void>;
  updateConfig: (data: Partial<StoreConfig>) => Promise<StoreConfig>;
}

const DEFAULT_CONFIG: StoreConfig = {
  id: 'default',
  name: 'COMERCIAL RODRIGO',
  subtitle: 'VENTA POR MAYOR Y MENOR',
  ruc: '10458923011',
  phone: '(01) 987-654-321',
  address: 'Av. Principal 1234, Lima',
  footerText: '¡GRACIAS POR SU COMPRA! Comercial Rodrigo siempre a su servicio',
};

export const useConfigStore = create<ConfigState>((set) => ({
  config: DEFAULT_CONFIG,
  isLoading: false,
  error: null,

  fetchConfig: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiRequest('/settings');
      if (data) {
        set({ config: data, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch (err: any) {
      console.error('Error fetching store config:', err);
      // Mantener configuración predeterminada si hay error
      set({ isLoading: false, error: err.message });
    }
  },

  updateConfig: async (data: Partial<StoreConfig>) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await apiRequest('/settings', {
        method: 'PUT',
        data,
      });
      set({ config: updated, isLoading: false });
      return updated;
    } catch (err: any) {
      set({ isLoading: false, error: err.message });
      throw err;
    }
  },
}));
