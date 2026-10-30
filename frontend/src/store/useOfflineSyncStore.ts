import { create } from 'zustand';
import { offlineStorage, type OfflineSale } from '../lib/offlineStorage.js';
import { apiRequest } from '../api/client.js';

interface OfflineSyncState {
  isOnline: boolean;
  pendingCount: number;
  quarantinedCount: number;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  syncFeedbackMessage: string | null;
  syncFeedbackType: 'success' | 'error';

  setIsOnline: (status: boolean) => void;
  refreshPendingCount: () => Promise<number>;
  syncPendingSales: (manualForce?: boolean) => Promise<boolean>;
  exportQuarantinedSales: () => Promise<void>;
  initSyncListeners: () => () => void;
}

function mapOfflineSaleToDto(s: OfflineSale) {
  return {
    offlineId: s.offlineId,
    offlineTicketNumber: s.offlineTicketNumber,
    cashShiftId: s.cashShiftId,
    receiptType: s.receiptType || 'NOTA_VENTA',
    targetReceiptType: s.targetReceiptType,
    customerName: s.customerName || 'Cliente Varios',
    customerDocument: s.customerDocument || null,
    customerAddress: s.customerAddress || null,
    customerEmail: s.customerEmail || null,
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
  };
}

export const useOfflineSyncStore = create<OfflineSyncState>((set, get) => ({
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  pendingCount: 0,
  quarantinedCount: 0,
  isSyncing: false,
  lastSyncTime: null,
  syncFeedbackMessage: null,
  syncFeedbackType: 'success',

  setIsOnline: (status: boolean) => {
    set({ isOnline: status });
    if (status) {
      void get().syncPendingSales(false);
    }
  },

  refreshPendingCount: async () => {
    const [count, quarantined] = await Promise.all([
      offlineStorage.getPendingCount(),
      offlineStorage.getQuarantinedOfflineSales(),
    ]);
    set({ pendingCount: count, quarantinedCount: quarantined.length });
    return count;
  },

  exportQuarantinedSales: async () => {
    const quarantined = await offlineStorage.getQuarantinedOfflineSales();
    if (quarantined.length === 0) return;
    const blob = new Blob([JSON.stringify(quarantined, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `respaldo_ventas_offline_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  syncPendingSales: async (manualForce = false) => {
    const { isSyncing, isOnline } = get();
    if (isSyncing) return false;
    if (!isOnline && typeof navigator !== 'undefined' && !navigator.onLine) return false;

    // Bloqueo síncrono inmediato antes de awaits para evitar sincronizaciones duplicadas concurrentes
    set({ isSyncing: true });

    try {
      if (manualForce) {
        await offlineStorage.retryQuarantinedSales();
      }

      const pendingSales = await offlineStorage.getPendingOfflineSales(false);
      if (pendingSales.length === 0) {
        const quarantined = await offlineStorage.getQuarantinedOfflineSales();
        set({ isSyncing: false, pendingCount: 0, quarantinedCount: quarantined.length });
        return true;
      }

      let successCount = 0;
      let failedCount = 0;

      const processSyncResponse = async (results: { offlineId: string; success: boolean; error?: string }[]) => {
        for (const res of results) {
          if (res.success) {
            await offlineStorage.removeOfflineSale(res.offlineId);
            successCount++;
          } else {
            await offlineStorage.updateSaleStatus(res.offlineId, 'ERROR', res.error);
            failedCount++;
          }
        }
      };

      try {
        const response = await apiRequest<{
          syncedCount: number;
          failedCount: number;
          results: { offlineId: string; success: boolean; error?: string }[];
        }>('/sales/sync-offline', {
          method: 'POST',
          data: { sales: pendingSales.map(mapOfflineSaleToDto) },
        });

        if (response?.results) {
          await processSyncResponse(response.results);
        }
      } catch (batchErr: any) {
        // Si el lote completo fue rechazado por DTO (HTTP 400) y hay más de 1 venta,
        // reintentar individualmente para que una venta malformada no bloquee a las demás.
        if (!batchErr?.isNetworkError && batchErr?.statusCode === 400) {
          for (const singleSale of pendingSales) {
            try {
              const singleRes = await apiRequest<{
                results: { offlineId: string; success: boolean; error?: string }[];
              }>('/sales/sync-offline', {
                method: 'POST',
                data: { sales: [mapOfflineSaleToDto(singleSale)] },
              });
              if (singleRes?.results) {
                await processSyncResponse(singleRes.results);
              }
            } catch (singleErr: any) {
              await offlineStorage.updateSaleStatus(
                singleSale.offlineId,
                'ERROR',
                singleErr?.message || 'Error de validación en sincronización',
                true,
              );
              failedCount++;
            }
          }
        } else {
          throw batchErr;
        }
      }

      const [remainingCount, quarantined] = await Promise.all([
        offlineStorage.getPendingCount(),
        offlineStorage.getQuarantinedOfflineSales(),
      ]);

      const feedbackMsg =
        successCount > 0 && failedCount === 0
          ? `¡Se sincronizaron ${successCount} venta${successCount > 1 ? 's' : ''} offline con éxito!`
          : successCount > 0 && failedCount > 0
            ? `Sincronizadas ${successCount} venta(s); ${failedCount} requieren revisión.`
            : failedCount > 0
              ? `No se pudieron procesar ${failedCount} venta(s) offline por validación de negocio/stock.`
              : null;

      set({
        isSyncing: false,
        pendingCount: remainingCount,
        quarantinedCount: quarantined.length,
        lastSyncTime: new Date(),
        syncFeedbackMessage: feedbackMsg,
        syncFeedbackType: failedCount > 0 ? 'error' : 'success',
      });

      if (feedbackMsg) {
        setTimeout(() => {
          set({ syncFeedbackMessage: null });
        }, 6000);
      }

      return failedCount === 0;
    } catch (err: any) {
      console.warn('Error durante la sincronización automática de ventas offline:', err);
      const [remainingCount, quarantined] = await Promise.all([
        offlineStorage.getPendingCount(),
        offlineStorage.getQuarantinedOfflineSales(),
      ]);
      set({
        isSyncing: false,
        pendingCount: remainingCount,
        quarantinedCount: quarantined.length,
        syncFeedbackMessage: err?.isNetworkError
          ? 'No se pudo completar la sincronización (problema de red)'
          : err?.message || 'Error al sincronizar ventas offline',
        syncFeedbackType: 'error',
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
