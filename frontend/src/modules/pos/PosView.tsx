import React, { useState, useEffect, useCallback } from 'react';
import { useShiftStore } from '../../store/useShiftStore.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { useCartStore } from '../../store/useCartStore.js';
import { apiRequest } from '../../api/client.js';
import { formatCurrency } from '../../lib/utils.js';
import {
  ShoppingCart,
  CreditCard,
  Plus,
  Minus,
  Trash2,
  Search,
  Clock,
  Coins,
  History,
  ArrowLeft,
} from 'lucide-react';
import type { Product, Category } from '../../types/index.js';
import { getUnitBadge } from '../../lib/units.js';
import { CheckoutModal } from './CheckoutModal.js';
import { ReceiptTicketModal } from './ReceiptTicketModal.js';
import { RecentSalesModal } from './RecentSalesModal.js';
import { CashMovementModal } from './CashMovementModal.js';
import { offlineStorage } from '../../lib/offlineStorage.js';
import { useOfflineSyncStore } from '../../store/useOfflineSyncStore.js';

export const PosView: React.FC = () => {
  const { user } = useAuthStore();
  const { activeShift, fetchActiveShift } = useShiftStore();

  const {
    items,
    addItem,
    updateItemQty,
    removeItem,
    clearCart,
    isGlobalWholesale,
    toggleGlobalWholesale,
    toggleItemWholesale,
    getTotalAmount,
    getTotalItemsCount,
    getTotalWholesaleSavings,
  } = useCartStore();

  const totalAmount = getTotalAmount();
  const totalItemsCount = getTotalItemsCount();
  const wholesaleSavings = getTotalWholesaleSavings();

  // Estados de catálogo
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isLoadingProducts, setIsLoadingProducts] = useState<boolean>(true);

  // Estado responsivo para móvil y tablet
  const [mobileTab, setMobileTab] = useState<'catalog' | 'cart'>('catalog');

  // Estados de modales
  const [isCheckoutOpen, setIsCheckoutOpen] = useState<boolean>(false);
  const [isRecentSalesOpen, setIsRecentSalesOpen] = useState<boolean>(false);
  const [isMovementOpen, setIsMovementOpen] = useState<boolean>(false);
  const [completedSale, setCompletedSale] = useState<any | null>(null);

  // Cargar Categorías
  useEffect(() => {
    const fetchCats = async () => {
      try {
        const cats = await apiRequest('/products/categories');
        setCategories(cats || []);
      } catch (err) {
        console.error('Error fetching categories:', err);
      }
    };
    fetchCats();
  }, []);

  // Cargar Productos (con soporte online y fallback transparente a IndexedDB offline)
  const fetchProducts = useCallback(async () => {
    setIsLoadingProducts(true);

    // Si el navegador ya detectó que no hay internet, buscar directamente en IndexedDB
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      try {
        const offlineList = await offlineStorage.searchProducts(searchTerm, selectedCategory);
        setProducts(offlineList);
      } catch (e) {
        console.error('Error reading offline products:', e);
      } finally {
        setIsLoadingProducts(false);
      }
      return;
    }

    try {
      let query = '/products?';
      if (selectedCategory && selectedCategory !== 'all') {
        query += `category=${encodeURIComponent(selectedCategory)}&`;
      }
      if (searchTerm.trim()) {
        query += `search=${encodeURIComponent(searchTerm.trim())}&`;
      }
      const data = await apiRequest(query);
      const prodList = data || [];
      setProducts(prodList);
      // Guardar productos en caché local de IndexedDB para disponibilidad offline
      offlineStorage.saveProducts(prodList);
    } catch (err) {
      console.warn('API de productos no disponible, cambiando a catálogo local (Offline):', err);
      // Fallback a IndexedDB local
      const offlineList = await offlineStorage.searchProducts(searchTerm, selectedCategory);
      setProducts(offlineList);
    } finally {
      setIsLoadingProducts(false);
    }
  }, [selectedCategory, searchTerm]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProducts();
    }, 200);
    return () => clearTimeout(timer);
  }, [fetchProducts]);

  // Manejo de finalización exitosa de venta
  const handleSaleSuccess = (saleData: any) => {
    setCompletedSale(saleData);
    fetchProducts();
    fetchActiveShift();
    useOfflineSyncStore.getState().refreshPendingCount();
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 text-slate-100 pb-24 lg:pb-6">
      {/* Banner de Turno (Diseño Serio Corporativo) */}
      <div className="mb-4 sm:mb-6 p-3.5 sm:p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-slate-800 border border-slate-700/80 flex items-center justify-center text-slate-300">
            <ShoppingCart className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <span>Punto de Venta</span>
              <span className="text-slate-600 font-normal">/</span>
              <span className="text-slate-300 font-medium">{activeShift?.cashRegister?.name || 'Caja'}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">
                Operando
              </span>
            </h2>
            <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>Apertura: {activeShift?.openedAt ? new Date(activeShift.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}</span>
              <span>•</span>
              <span>Cajero: <strong className="text-slate-200">{user?.name}</strong></span>
            </p>
          </div>
        </div>

        {/* Acciones Rápidas de Caja */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setIsMovementOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700/80 text-slate-300 border border-slate-700/80 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
            title="Registrar entrada o salida de efectivo menor"
          >
            <Coins className="w-3.5 h-3.5 text-slate-400" />
            <span>Movimiento Caja</span>
          </button>

          <button
            onClick={() => setIsRecentSalesOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700/80 text-slate-300 border border-slate-700/80 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
            title="Ver ventas realizadas y anular con PIN"
          >
            <History className="w-3.5 h-3.5 text-slate-400" />
            <span>Ventas del Turno</span>
          </button>

          <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-right">
            <span className="text-slate-500 block text-[9px] uppercase font-semibold">Fondo Inicial</span>
            <span className="font-bold font-mono text-xs text-white">
              {formatCurrency(activeShift?.initialBalance || 0)}
            </span>
          </div>
        </div>
      </div>

      {/* Selector de Pestañas Responsivo para Móvil y Tablet (< lg) */}
      <div className="flex lg:hidden rounded-xl bg-slate-900 p-1 border border-slate-800 mb-4">
        <button
          onClick={() => setMobileTab('catalog')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
            mobileTab === 'catalog'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Catálogo ({products.length})
        </button>
        <button
          onClick={() => setMobileTab('cart')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            mobileTab === 'cart'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          <span>Ticket {totalItemsCount > 0 ? `(${totalItemsCount} • ${formatCurrency(totalAmount)})` : ''}</span>
        </button>
      </div>

      {/* Grid del POS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Catálogo de Productos (Visible en desktop o cuando mobileTab === 'catalog') */}
        <div className={`lg:col-span-2 space-y-4 ${mobileTab === 'cart' ? 'hidden lg:block' : 'block'}`}>
          {/* Barra de Filtro y Búsqueda */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 bg-slate-900 p-3 rounded-2xl border border-slate-800">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar producto o escanear código de barras..."
                className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 outline-none transition-all"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto text-xs pb-1 sm:pb-0 scrollbar-none">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-3 py-1.5 rounded-xl font-semibold transition-all cursor-pointer whitespace-nowrap text-xs ${
                  selectedCategory === 'all'
                    ? 'bg-slate-800 text-white border border-slate-700'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-transparent'
                }`}
              >
                Todos
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCategory(c.id)}
                  className={`px-3 py-1.5 rounded-xl font-semibold transition-all cursor-pointer whitespace-nowrap text-xs ${
                    selectedCategory === c.id
                      ? 'bg-slate-800 text-white border border-slate-700'
                      : 'bg-slate-950 text-slate-400 hover:text-white border border-transparent'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          {/* Tarjetas de Producto en Grid Adaptable a Tablet y Celular */}
          {isLoadingProducts ? (
            <div className="py-20 text-center text-xs text-slate-400">
              <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin mx-auto mb-2" />
              Cargando catálogo en tiempo real...
            </div>
          ) : products.length === 0 ? (
            <div className="py-20 text-center text-slate-500 text-xs bg-slate-900 rounded-2xl border border-slate-800">
              No se encontraron productos coincidentes.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3.5">
              {products.map((p) => {
                const isOutOfStock = p.currentStock <= 0;
                const isLowStock = p.currentStock <= p.minStock && !isOutOfStock;

                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      if (!isOutOfStock) addItem(p);
                    }}
                    className={`bg-slate-900 border rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between transition-all select-none ${
                      isOutOfStock
                        ? 'opacity-50 border-slate-800 cursor-not-allowed'
                        : 'border-slate-800 hover:border-slate-700 cursor-pointer active:scale-[0.98]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between text-[11px] mb-1.5">
                        <span
                          className={`px-1.5 py-0.5 rounded font-mono text-[9px] font-semibold ${
                            isOutOfStock
                              ? 'bg-rose-500/20 text-rose-400'
                              : isLowStock
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          Stock: {p.currentStock}
                        </span>

                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[9px] whitespace-nowrap">
                          {getUnitBadge(p.unitType)}
                        </span>
                      </div>

                      <h4 className="font-bold text-white text-xs sm:text-sm line-clamp-2">
                        {p.name}
                      </h4>

                      {p.barcode && (
                        <p className="text-[9px] text-slate-500 font-mono mt-0.5 truncate">
                          {p.barcode}
                        </p>
                      )}
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-end justify-between gap-1">
                      <div>
                        <div className="text-sm sm:text-base font-extrabold text-white">
                          {formatCurrency(p.retailPrice)}
                        </div>
                        {p.wholesalePrice != null && Number(p.wholesalePrice) > 0 ? (
                          <div className="text-[10px] text-amber-400 font-medium mt-0.5">
                            Mayor: {formatCurrency(p.wholesalePrice)}{' '}
                            <span className="text-[9px] text-slate-500 font-normal">(≥{p.wholesaleMinQty || 3})</span>
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-500 font-normal mt-0.5">
                            Precio único
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        disabled={isOutOfStock}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isOutOfStock) addItem(p);
                        }}
                        className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center transition-all shrink-0 ${
                          isOutOfStock
                            ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm'
                        }`}
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Carrito de Compra (Visible en desktop o cuando mobileTab === 'cart') */}
        <div
          className={`bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 flex flex-col justify-between shadow-lg sticky top-20 max-h-[calc(100vh-6rem)] ${
            mobileTab === 'catalog' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          <div>
            {/* Botón de retorno en móvil */}
            <button
              onClick={() => setMobileTab('catalog')}
              className="lg:hidden mb-3 text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1.5 cursor-pointer py-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Seguir agregando productos</span>
            </button>

            {/* Header Carrito */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-slate-400" />
                <h3 className="font-bold text-white text-sm sm:text-base">Ticket de Venta</h3>
                {totalItemsCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-xs font-semibold font-mono">
                    {totalItemsCount}
                  </span>
                )}
              </div>

              {items.length > 0 && (
                <button
                  onClick={clearCart}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-all cursor-pointer"
                  title="Vaciar ticket"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Control de Tarifa Mayorista Global (Serio y Sobrio) */}
            <div className="mt-3 p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-200">Tarifa Mayorista</div>
                <div className="text-[10px] text-slate-400">
                  {isGlobalWholesale
                    ? 'Precios mayoristas aplicados a todo'
                    : 'Automático según cantidad mínima'}
                </div>
              </div>

              <button
                type="button"
                onClick={toggleGlobalWholesale}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                  isGlobalWholesale
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                }`}
              >
                {isGlobalWholesale ? 'ACTIVA' : 'NORMAL'}
              </button>
            </div>

            {/* Lista de Items en el Ticket */}
            <div className="mt-3 space-y-2 max-h-[300px] sm:max-h-[340px] overflow-y-auto pr-1">
              {items.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  <ShoppingCart className="w-8 h-8 mx-auto text-slate-700 mb-2 stroke-1" />
                  El ticket está vacío.
                  <p className="text-[11px] text-slate-600 mt-1">
                    Selecciona productos en el catálogo para cobrar.
                  </p>
                </div>
              ) : (
                items.map((item) => (
                  <div
                    key={item.product.id}
                    className="p-2.5 sm:p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex flex-col gap-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h5 className="font-semibold text-white text-xs leading-tight">
                          {item.product.name}
                        </h5>
                        <div className="flex items-center gap-2 mt-1">
                          {item.product.wholesalePrice != null && Number(item.product.wholesalePrice) > 0 ? (
                            <button
                              type="button"
                              onClick={() => toggleItemWholesale(item.product.id)}
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded cursor-pointer transition-all ${
                                item.isWholesaleApplied
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                              }`}
                              title="Alternar precio mayorista para este item"
                            >
                              {item.isWholesaleApplied ? 'MAYORISTA' : 'MENOR'}:{' '}
                              {formatCurrency(item.unitPrice)}
                            </button>
                          ) : (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-800/60 text-slate-400">
                              {formatCurrency(item.unitPrice)}
                            </span>
                          )}
                          <span className="text-[10px] text-slate-500 font-mono">
                            {getUnitBadge(item.product.unitType)}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => removeItem(item.product.id)}
                        className="p-1 rounded-lg text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                      {/* Controles de Cantidad */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateItemQty(item.product.id, item.quantity - 1)}
                          className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-all cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>

                        <input
                          type="number"
                          step={['KG', 'LT'].includes(item.product.unitType) ? '0.1' : '1'}
                          min="0.1"
                          max={item.product.currentStock}
                          value={item.quantity}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) updateItemQty(item.product.id, val);
                          }}
                          className="w-12 text-center bg-slate-900 border border-slate-800 rounded-lg py-0.5 text-xs font-bold text-white outline-none font-mono"
                        />

                        <button
                          onClick={() => updateItemQty(item.product.id, item.quantity + 1)}
                          className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-all cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="font-extrabold text-white text-xs font-mono">
                        {formatCurrency(item.subtotal)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Resumen Financiero y Botón de Cobro */}
          <div className="border-t border-slate-800 pt-3.5 space-y-2 mt-3">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Subtotal:</span>
              <span className="font-mono">{formatCurrency(totalAmount + wholesaleSavings)}</span>
            </div>

            {wholesaleSavings > 0 && (
              <div className="flex justify-between text-xs text-amber-400 font-semibold bg-amber-500/10 px-2.5 py-1 rounded-xl border border-amber-500/20">
                <span>Descuento por Mayor:</span>
                <span className="font-mono">-{formatCurrency(wholesaleSavings)}</span>
              </div>
            )}

            <div className="flex justify-between text-base sm:text-lg font-extrabold text-white pt-1">
              <span>Total a Cobrar:</span>
              <span className="text-emerald-400 font-mono">{formatCurrency(totalAmount)}</span>
            </div>

            <button
              disabled={items.length === 0}
              onClick={() => setIsCheckoutOpen(true)}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-1"
            >
              <CreditCard className="w-4 h-4" />
              <span>Cobrar ({formatCurrency(totalAmount)})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Barra Flotante Inferior para Celular y Tablet en vista Catálogo */}
      {mobileTab === 'catalog' && items.length > 0 && (
        <div className="lg:hidden fixed bottom-3 left-3 right-3 z-30 p-3 bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-2xl shadow-2xl flex items-center justify-between">
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-semibold">
              Ticket ({totalItemsCount} {totalItemsCount === 1 ? 'artículo' : 'artículos'})
            </div>
            <div className="text-base font-extrabold text-emerald-400 font-mono">
              {formatCurrency(totalAmount)}
            </div>
          </div>
          <button
            onClick={() => setMobileTab('cart')}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/30 cursor-pointer"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Ver Ticket / Cobrar</span>
          </button>
        </div>
      )}

      {/* MODAL DE PROCESAMIENTO DE COBRO */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        onSaleSuccess={handleSaleSuccess}
      />

      {/* MODAL DE VISTA E IMPRESIÓN DEL COMPROBANTE TÉRMICO */}
      <ReceiptTicketModal
        isOpen={!!completedSale}
        onClose={() => setCompletedSale(null)}
        saleData={completedSale}
      />

      {/* MODAL DE HISTORIAL DE VENTAS DEL TURNO Y ANULACIÓN CON PIN */}
      <RecentSalesModal
        isOpen={isRecentSalesOpen}
        onClose={() => setIsRecentSalesOpen(false)}
        onSaleVoided={() => {
          fetchProducts();
          fetchActiveShift();
        }}
      />

      {/* MODAL DE MOVIMIENTOS MANUALES DE CAJA (INGRESO / EGRESO) */}
      <CashMovementModal
        isOpen={isMovementOpen}
        onClose={() => setIsMovementOpen(false)}
        onSuccess={() => fetchActiveShift()}
      />
    </div>
  );
};
