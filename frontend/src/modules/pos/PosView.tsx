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
  Tag,
  Clock,
  Coins,
  History,
  Sparkles,
} from 'lucide-react';
import type { Product, Category } from '../../types/index.js';
import { CheckoutModal } from './CheckoutModal.js';
import { ReceiptTicketModal } from './ReceiptTicketModal.js';
import { RecentSalesModal } from './RecentSalesModal.js';
import { CashMovementModal } from './CashMovementModal.js';

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

  // Cargar Productos
  const fetchProducts = useCallback(async () => {
    setIsLoadingProducts(true);
    try {
      let query = '/products?';
      if (selectedCategory && selectedCategory !== 'all') {
        query += `category=${encodeURIComponent(selectedCategory)}&`;
      }
      if (searchTerm.trim()) {
        query += `search=${encodeURIComponent(searchTerm.trim())}&`;
      }
      const data = await apiRequest(query);
      setProducts(data || []);
    } catch (err) {
      console.error('Error fetching products:', err);
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
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 text-slate-100">
      {/* Banner de Bienvenida del Turno y Botones Rápidos */}
      <div className="mb-6 p-4 rounded-3xl bg-gradient-to-r from-indigo-950/60 via-slate-900 to-slate-900 border border-indigo-500/20 flex flex-wrap items-center justify-between gap-4 shadow-xl shadow-indigo-950/20">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-md shadow-indigo-600/20">
            <ShoppingCart className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              Punto de Venta • {activeShift?.cashRegister?.name}
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30">
                Operando
              </span>
            </h2>
            <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              Aperturado:{' '}
              {activeShift?.openedAt ? new Date(activeShift.openedAt).toLocaleTimeString() : '--'} •
              Cajero: <strong className="text-slate-200">{user?.name}</strong>
            </p>
          </div>
        </div>

        {/* Acciones Rápidas de Caja */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setIsMovementOpen(true)}
            className="px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer hover:shadow-md"
            title="Registrar entrada o salida de efectivo menor"
          >
            <Coins className="w-4 h-4 text-amber-400" />
            <span>Movimiento Caja</span>
          </button>

          <button
            onClick={() => setIsRecentSalesOpen(true)}
            className="px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-indigo-300 border border-indigo-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer hover:shadow-md"
            title="Ver ventas realizadas y anular con PIN"
          >
            <History className="w-4 h-4 text-indigo-400" />
            <span>Ventas del Turno</span>
          </button>

          <div className="px-3.5 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-right">
            <span className="text-slate-500 block text-[10px]">Fondo Inicial:</span>
            <span className="font-bold text-xs text-white">
              {formatCurrency(activeShift?.initialBalance || 0)}
            </span>
          </div>
        </div>
      </div>

      {/* Grid del POS: Catálogo a la izquierda y Carrito a la derecha */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Catálogo de Productos (2 Columnas) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Barra de Filtro y Búsqueda */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900 p-3.5 rounded-2xl border border-slate-800 shadow-md">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nombre o escanear código de barras..."
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 outline-none transition-all"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto text-xs pb-1 sm:pb-0">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-3 py-1.5 rounded-xl font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  selectedCategory === 'all'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'bg-slate-800/80 text-slate-400 hover:text-white'
                }`}
              >
                Todos
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCategory(c.id)}
                  className={`px-3 py-1.5 rounded-xl font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    selectedCategory === c.id
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'bg-slate-800/80 text-slate-400 hover:text-white'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          {/* Tarjetas de Producto */}
          {isLoadingProducts ? (
            <div className="py-20 text-center text-xs text-slate-400">
              <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mx-auto mb-2" />
              Cargando catálogo en tiempo real...
            </div>
          ) : products.length === 0 ? (
            <div className="py-20 text-center text-slate-500 text-xs bg-slate-900/50 rounded-2xl border border-slate-800/80">
              No se encontraron productos coincidentes.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
              {products.map((p) => {
                const isOutOfStock = p.currentStock <= 0;
                const isLowStock = p.currentStock <= p.minStock && !isOutOfStock;

                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      if (!isOutOfStock) addItem(p);
                    }}
                    className={`bg-slate-900 border rounded-2xl p-4 flex flex-col justify-between transition-all select-none ${
                      isOutOfStock
                        ? 'opacity-60 border-slate-800 cursor-not-allowed'
                        : 'border-slate-800 hover:border-indigo-500/50 hover:shadow-xl hover:shadow-indigo-600/10 cursor-pointer group active:scale-[0.98]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between text-[11px] mb-2">
                        <span
                          className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-semibold ${
                            isOutOfStock
                              ? 'bg-rose-500/20 text-rose-400'
                              : isLowStock
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          Stock: {p.currentStock}
                        </span>

                        <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-medium text-[10px]">
                          {p.unitType}
                        </span>
                      </div>

                      <h4 className="font-bold text-white text-sm group-hover:text-indigo-300 transition-colors line-clamp-2">
                        {p.name}
                      </h4>

                      {p.barcode && (
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                          EAN: {p.barcode}
                        </p>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-end justify-between">
                      <div>
                        <div className="text-base font-extrabold text-white">
                          {formatCurrency(p.retailPrice)}
                        </div>
                        <div className="text-[10px] text-amber-400 font-semibold flex items-center gap-1 mt-0.5">
                          <Tag className="w-3 h-3" />
                          Mayor: {formatCurrency(p.wholesalePrice)} (≥{p.wholesaleMinQty})
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isOutOfStock}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isOutOfStock) addItem(p);
                        }}
                        className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                          isOutOfStock
                            ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                            : 'bg-indigo-600 group-hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30'
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

        {/* Carrito de Compra (1 Columna) */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 flex flex-col justify-between shadow-2xl sticky top-20 max-h-[calc(100vh-6rem)]">
          <div>
            {/* Header Carrito */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-white text-base">Ticket de Venta</h3>
                {totalItemsCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-indigo-600/30 text-indigo-300 text-xs font-semibold">
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

            {/* Toggle de Venta Mayorista Global */}
            <div className="mt-3 p-2.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <div>
                  <div className="text-xs font-bold text-white">Tarifa Mayorista</div>
                  <div className="text-[10px] text-slate-400">
                    {isGlobalWholesale
                      ? 'Precios mayoristas aplicados a todo'
                      : 'Automático por volumen'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={toggleGlobalWholesale}
                className={`px-2.5 py-1 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  isGlobalWholesale
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                }`}
              >
                {isGlobalWholesale ? 'ACTIVO' : 'NORMAL'}
              </button>
            </div>

            {/* Lista de Items en el Ticket */}
            <div className="mt-3 space-y-2 max-h-[290px] overflow-y-auto pr-1">
              {items.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  <ShoppingCart className="w-10 h-10 mx-auto text-slate-700 mb-2 stroke-1" />
                  El carrito está vacío.
                  <p className="text-[11px] text-slate-600 mt-1">
                    Haz clic en un producto para agregarlo al ticket.
                  </p>
                </div>
              ) : (
                items.map((item) => (
                  <div
                    key={item.product.id}
                    className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80 flex flex-col gap-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h5 className="font-bold text-white text-xs leading-tight">
                          {item.product.name}
                        </h5>
                        <div className="flex items-center gap-2 mt-1">
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
                          <span className="text-[10px] text-slate-500 font-mono">
                            {item.product.unitType}
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

                    <div className="flex items-center justify-between pt-1 border-t border-slate-800/50">
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
                          step={item.product.unitType === 'UNIT' ? '1' : '0.1'}
                          min="0.1"
                          max={item.product.currentStock}
                          value={item.quantity}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) updateItemQty(item.product.id, val);
                          }}
                          className="w-12 text-center bg-slate-900 border border-slate-800 rounded-lg py-0.5 text-xs font-bold text-white outline-none"
                        />

                        <button
                          onClick={() => updateItemQty(item.product.id, item.quantity + 1)}
                          className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-all cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="font-extrabold text-white text-xs">
                        {formatCurrency(item.subtotal)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Resumen Financiero y Botón de Cobro */}
          <div className="border-t border-slate-800 pt-4 space-y-2.5 mt-3">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Subtotal:</span>
              <span>{formatCurrency(totalAmount + wholesaleSavings)}</span>
            </div>

            {wholesaleSavings > 0 && (
              <div className="flex justify-between text-xs text-amber-400 font-semibold bg-amber-500/10 px-2.5 py-1 rounded-xl border border-amber-500/20">
                <span className="flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5" /> Ahorro por Mayor:
                </span>
                <span>-{formatCurrency(wholesaleSavings)}</span>
              </div>
            )}

            <div className="flex justify-between text-lg font-extrabold text-white pt-1">
              <span>Total a Cobrar:</span>
              <span className="text-emerald-400">{formatCurrency(totalAmount)}</span>
            </div>

            <button
              disabled={items.length === 0}
              onClick={() => setIsCheckoutOpen(true)}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold text-sm shadow-xl shadow-emerald-600/30 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
            >
              <CreditCard className="w-4 h-4" />
              Cobrar Venta ({formatCurrency(totalAmount)})
            </button>
          </div>
        </div>
      </div>

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
