import type { Product, CashShift, PaymentMethod } from '../types/index.js';

export interface OfflineSaleItem {
  productId: string;
  productName: string;
  unitType?: string;
  quantity: number;
  unitPrice: number;
  isWholesaleApplied: boolean;
  subtotal: number;
}

export interface OfflineSale {
  offlineId: string;
  offlineTicketNumber: string;
  cashShiftId: string;
  shiftRegisterName?: string;
  userId: string;
  userName?: string;
  customerName?: string;
  customerDocument?: string;
  paymentMethod: PaymentMethod;
  cashPaid: number;
  digitalPaid: number;
  totalAmount: number;
  changeAmount: number;
  items: OfflineSaleItem[];
  createdAt: string; // ISO String
  syncStatus: 'PENDING' | 'SYNCING' | 'SYNCED' | 'ERROR';
  syncError?: string;
}

const DB_NAME = 'ComercialRodrigo_OfflineDB';
const DB_VERSION = 1;

class OfflineStorageService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB no está soportado en este entorno'));
        return;
      }

      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Tabla de Productos para catálogo y escáner offline
        if (!db.objectStoreNames.contains('products')) {
          const productStore = db.createObjectStore('products', { keyPath: 'id' });
          productStore.createIndex('barcode', 'barcode', { unique: false });
          productStore.createIndex('name', 'name', { unique: false });
          productStore.createIndex('categoryId', 'categoryId', { unique: false });
        }

        // Cola de Ventas Offline
        if (!db.objectStoreNames.contains('offlineSales')) {
          const salesStore = db.createObjectStore('offlineSales', { keyPath: 'offlineId' });
          salesStore.createIndex('syncStatus', 'syncStatus', { unique: false });
          salesStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Caché de Turno Activo
        if (!db.objectStoreNames.contains('activeShiftCache')) {
          db.createObjectStore('activeShiftCache', { keyPath: 'key' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        this.dbPromise = null;
        reject(request.error);
      };
    });

    return this.dbPromise;
  }

  // --- MÉTODOS DE PRODUCTOS ---

  async saveProducts(products: Product[]): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction('products', 'readwrite');
      const store = tx.objectStore('products');

      for (const product of products) {
        store.put(product);
      }

      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn('Error al guardar productos en IndexedDB:', err);
    }
  }

  async getAllProducts(): Promise<Product[]> {
    try {
      const db = await this.getDB();
      const tx = db.transaction('products', 'readonly');
      const store = tx.objectStore('products');
      const request = store.getAll();

      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      console.warn('Error al leer productos desde IndexedDB:', err);
      return [];
    }
  }

  async searchProducts(searchTerm = '', categoryId = 'all'): Promise<Product[]> {
    const all = await this.getAllProducts();
    let filtered = all.filter((p) => p.isActive !== false);

    if (categoryId && categoryId !== 'all') {
      filtered = filtered.filter((p) => p.categoryId === categoryId);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      filtered = filtered.filter((p) => {
        const matchesName = p.name.toLowerCase().includes(term);
        const matchesBarcode = p.barcode ? p.barcode.toLowerCase().includes(term) : false;
        return matchesName || matchesBarcode;
      });
    }

    return filtered;
  }

  async decrementProductStock(productId: string, quantitySold: number): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction('products', 'readwrite');
      const store = tx.objectStore('products');
      const request = store.get(productId);

      request.onsuccess = () => {
        const product = request.result as Product;
        if (product) {
          const current = Number(product.currentStock) || 0;
          product.currentStock = Math.max(0, current - quantitySold);
          store.put(product);
        }
      };
    } catch (err) {
      console.warn(`No se pudo descontar stock local para producto ${productId}:`, err);
    }
  }

  // --- MÉTODOS DE VENTAS OFFLINE ---

  async saveOfflineSale(sale: OfflineSale): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction('offlineSales', 'readwrite');
    const store = tx.objectStore('offlineSales');
    store.put(sale);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getPendingOfflineSales(): Promise<OfflineSale[]> {
    try {
      const db = await this.getDB();
      const tx = db.transaction('offlineSales', 'readonly');
      const store = tx.objectStore('offlineSales');
      const request = store.getAll();

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          const list = (request.result || []) as OfflineSale[];
          // Retornar solo pendientes o con error que requieran reintento
          resolve(list.filter((s) => s.syncStatus === 'PENDING' || s.syncStatus === 'ERROR'));
        };
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      console.warn('Error al consultar ventas offline pendientes:', err);
      return [];
    }
  }

  async getPendingCount(): Promise<number> {
    const pending = await this.getPendingOfflineSales();
    return pending.length;
  }

  async updateSaleStatus(
    offlineId: string,
    status: OfflineSale['syncStatus'],
    error?: string,
  ): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction('offlineSales', 'readwrite');
      const store = tx.objectStore('offlineSales');
      const request = store.get(offlineId);

      request.onsuccess = () => {
        const sale = request.result as OfflineSale;
        if (sale) {
          sale.syncStatus = status;
          if (error) sale.syncError = error;
          store.put(sale);
        }
      };
    } catch (err) {
      console.warn('Error actualizando estado de venta offline:', err);
    }
  }

  async removeOfflineSale(offlineId: string): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction('offlineSales', 'readwrite');
      const store = tx.objectStore('offlineSales');
      store.delete(offlineId);
    } catch (err) {
      console.warn('Error eliminando venta offline sincronizada:', err);
    }
  }

  // --- MÉTODOS DE CACHÉ DE TURNO ACTIVO ---

  async cacheActiveShift(shift: CashShift | null): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction('activeShiftCache', 'readwrite');
      const store = tx.objectStore('activeShiftCache');
      if (shift) {
        store.put({ key: 'currentShift', shift, updatedAt: new Date().toISOString() });
        localStorage.setItem('cached_active_shift', JSON.stringify(shift));
      } else {
        store.delete('currentShift');
        localStorage.removeItem('cached_active_shift');
      }
    } catch (err) {
      console.warn('Error guardando turno activo en caché:', err);
    }
  }

  async getCachedActiveShift(): Promise<CashShift | null> {
    try {
      // 1. Intentar localStorage primero (más rápido)
      const fromLocal = localStorage.getItem('cached_active_shift');
      if (fromLocal) {
        try {
          return JSON.parse(fromLocal);
        } catch {}
      }

      // 2. Intentar IndexedDB
      const db = await this.getDB();
      const tx = db.transaction('activeShiftCache', 'readonly');
      const store = tx.objectStore('activeShiftCache');
      const request = store.get('currentShift');

      return new Promise((resolve) => {
        request.onsuccess = () => resolve(request.result?.shift || null);
        request.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }
}

export const offlineStorage = new OfflineStorageService();
