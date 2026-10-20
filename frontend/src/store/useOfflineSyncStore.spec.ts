import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useOfflineSyncStore } from './useOfflineSyncStore.js';
import { offlineStorage } from '../lib/offlineStorage.js';
import { apiRequest } from '../api/client.js';

vi.mock('../lib/offlineStorage.js', () => ({
  offlineStorage: {
    getPendingCount: vi.fn(),
    getPendingOfflineSales: vi.fn(),
    removeOfflineSale: vi.fn(),
    updateSaleStatus: vi.fn(),
  },
}));

vi.mock('../api/client.js', () => ({
  apiRequest: vi.fn(),
}));

describe('useOfflineSyncStore - Cola de Sincronización Offline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useOfflineSyncStore.setState({
      isOnline: true,
      pendingCount: 0,
      isSyncing: false,
      lastSyncTime: null,
      syncFeedbackMessage: null,
    });
  });

  it('debe actualizar el estado online/offline', () => {
    const store = useOfflineSyncStore.getState();
    store.setIsOnline(false);

    expect(useOfflineSyncStore.getState().isOnline).toBe(false);
  });

  it('debe refrescar el conteo de ventas pendientes consultando offlineStorage', async () => {
    vi.mocked(offlineStorage.getPendingCount).mockResolvedValue(4);

    const store = useOfflineSyncStore.getState();
    const count = await store.refreshPendingCount();

    expect(count).toBe(4);
    expect(useOfflineSyncStore.getState().pendingCount).toBe(4);
    expect(offlineStorage.getPendingCount).toHaveBeenCalledTimes(1);
  });

  it('debe sincronizar ventas pendientes con el backend exitosamente', async () => {
    const mockPendingSales = [
      {
        offlineId: 'offline-sale-1',
        cashShiftId: 'shift-1',
        paymentMethod: 'CASH',
        cashPaid: 50,
        digitalPaid: 0,
        changeAmount: 0,
        createdAt: new Date().toISOString(),
        items: [{ productId: 'p1', quantity: 2, unitPrice: 25, isWholesaleApplied: false }],
      },
    ];

    vi.mocked(offlineStorage.getPendingOfflineSales).mockResolvedValue(mockPendingSales as any);
    vi.mocked(apiRequest).mockResolvedValue({
      syncedCount: 1,
      failedCount: 0,
      results: [{ offlineId: 'offline-sale-1', success: true }],
    });
    vi.mocked(offlineStorage.getPendingCount).mockResolvedValue(0);

    const store = useOfflineSyncStore.getState();
    const result = await store.syncPendingSales();

    expect(result).toBe(true);
    expect(offlineStorage.removeOfflineSale).toHaveBeenCalledWith('offline-sale-1');
    expect(useOfflineSyncStore.getState().isSyncing).toBe(false);
  });
});
