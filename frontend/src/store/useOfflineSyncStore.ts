import { create } from 'zustand';
import { offlineStorage } from '../lib/offlineStorage.js';
import { apiRequest } from '../api/client.js';

interface OfflineSyncState {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  syncFeedbackMessage: string | null;
  
  setIsOnline: (status: boolean) => void;
  refreshPendingCount: () => Promise<number>;
  syncPendingSales: () => Promise<boolean>;
  initSyncListeners: () => () => void;
}

export const useOfflineSyncStore = create<OfflineSyncState>((set, get) => ({
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  pendingCount: 0,
  isSyncing: false,
  lastSyncTime: null,
  syncFeedbackMessage: null,

  setIsOnline: (status: boolean) => {
    set({ isOnline: status });
    if (status) {
      // Al recuperar conexión, sincronizar automáticamente
      get().syncPendingSales();
    }
  },

  refreshPendingCount: async () => {
    const count = await offlineStorage.getPendingCount();
    set({ pendingCount: count });
    return count;
  },

  syncPendingSales: async () => {
    const { isSyncing, isOnline } = get();
    if (isSyncing) return false;
    if (!isOnline && typeof navigator !== 'undefined' && !navigator.onLine) return false;

    const pendingSales = await offlineStorage.getPendingOfflineSales();
    if (pendingSales.length === 0) {
      set({ pendingCount: 0 });
      return true;
    }

    set({ isSyncing: true });

    try {
      const payload = {
        sales: pendingSales.map((s) => ({
          offlineId: s.offlineId,
          cashShiftId: s.cashShiftId,
          customerName: s.customerName || 'Cliente Varios',
          customerDocument: s.customerDocument || null,
          paymentMethod: s.paymentMethod,
          cashPaid: s.cashPaid,
          digitalPaid: s.digitalPaid,
          changeAmount: s.changeAmount,
          createdAt: s.createdAt,
          items: s.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            isWholesaleApplied: i.isWholesaleApplied,
          })),
        })),
      };

      const response = await apiRequest<{
        syncedCount: number;
        failedCount: number;
        results: { offlineId: string; success: boolean; error?: string }[];
      }>('/sales/sync-offline', {
        method: 'POST',
        data: payload,
      });

      // Procesar respuestas individuales
      if (response && response.results) {
        for (const res of response.results) {
          if (res.success) {
            await offlineStorage.removeOfflineSale(res.offlineId);
          } else {
            await offlineStorage.updateSaleStatus(res.offlineId, 'ERROR', res.error);
          }
        }
      }

      const remainingCount = await offlineStorage.getPendingCount();
      const successCount = response.syncedCount || 0;

      set({
        isSyncing: false,
        pendingCount: remainingCount,
        lastSyncTime: new Date(),
        syncFeedbackMessage:
          successCount > 0
            ? `¡Se sincronizaron ${successCount} venta${successCount > 1 ? 's' : ''} offline con éxito!`
            : null,
      });

      if (successCount > 0) {
        setTimeout(() => {
          set({ syncFeedbackMessage: null });
        }, 6000);
      }

      return true;
    } catch (err: any) {
      console.warn('Error durante la sincronización automática de ventas offline:', err);
      const remainingCount = await offlineStorage.getPendingCount();
      set({
        isSyncing: false,
        pendingCount: remainingCount,
        syncFeedbackMessage: 'No se pudo completar la sincronización (problema de red)',
      });

      setTimeout(() => {
        set({ syncFeedbackMessage: null });
      }, 5000);

      return false;
    }
  },

  initSyncListeners: () => {
    const handleOnline = () => {
      set({ isOnline: true });
      get().refreshPendingCount().then((count) => {
        if (count > 0) {
          get().syncPendingSales();
        }
      });
    };

    const handleOffline = () => {
      set({ isOnline: false });
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      // Cargar conteo inicial
      get().refreshPendingCount();

      // Intervalo periódico de sincronización si hay conexión (cada 45 segundos)
      const intervalId = window.setInterval(() => {
        if (navigator.onLine) {
          get().refreshPendingCount().then((count) => {
            if (count > 0 && !get().isSyncing) {
              get().syncPendingSales();
            }
          });
        }
      }, 45000);

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        window.clearInterval(intervalId);
      };
    }

    return () => {};
  },
}));
