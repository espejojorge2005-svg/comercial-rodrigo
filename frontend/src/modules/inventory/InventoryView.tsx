import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../../api/client.js';
import { formatCurrency } from '../../lib/utils.js';
import {
  Package,
  Plus,
  Search,
  Edit2,
  Trash2,
  AlertTriangle,
  DollarSign,
  TrendingUp,
  RotateCcw,
  History,
  X,
  ArrowDownRight,
  ArrowUpRight,
} from 'lucide-react';
import type { Product, Category, UnitType } from '../../types/index.js';

export const InventoryView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'catalog' | 'kardex'>('catalog');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [kardexList, setKardexList] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Modales
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);

  // Cargar Categorías
  const fetchCategories = useCallback(async () => {
    try {
      const data = await apiRequest('/products/categories');
      setCategories(data || []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  // Cargar Productos
  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      let url = '/products?';
      if (selectedCategory !== 'all') url += `category=${encodeURIComponent(selectedCategory)}&`;
      if (searchTerm.trim()) url += `search=${encodeURIComponent(searchTerm.trim())}&`;
      const data = await apiRequest(url);
      setProducts(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedCategory, searchTerm]);

  // Cargar Kardex
  const fetchKardex = useCallback(async () => {
    try {
      const data = await apiRequest('/products/kardex');
      setKardexList(data || []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    if (activeTab === 'catalog') {
      const timer = setTimeout(() => {
        fetchProducts();
      }, 200);
      return () => clearTimeout(timer);
    } else {
      fetchKardex();
    }
  }, [activeTab, fetchProducts, fetchKardex]);

  // Métricas de Almacén
  const totalProducts = products.length;
  const lowStockCount = products.filter((p) => p.currentStock <= p.minStock).length;
  const totalStockValue = products.reduce(
    (acc, p) => acc + p.currentStock * (p.costPrice || 0),
    0,
  );
  const avgMargin =
    products.length > 0
      ? (
          products.reduce((acc, p) => {
            const cost = p.costPrice || 0;
            return acc + (cost > 0 ? ((p.retailPrice - cost) / cost) * 100 : 0);
          }, 0) / products.length
        ).toFixed(1)
      : '0';

  // Eliminar producto
  const handleDeleteProduct = async (id: string, name: string) => {
    if (!confirm(`¿Estás seguro de desactivar el producto "${name}"?`)) return;
    try {
      await apiRequest(`/products/${id}`, { method: 'DELETE' });
      fetchProducts();
    } catch (err: any) {
      alert(err.message || 'Error al eliminar');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 text-slate-100">
      {/* Banner y Tarjetas de Métricas */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-white flex items-center gap-2.5">
            <Package className="w-6 h-6 text-indigo-400" />
            Gestión de Inventario & Kardex
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Control de existencias, márgenes de ganancia y trazabilidad para Comercial Rodrigo.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Selector de Pestaña */}
          <div className="flex bg-slate-900 p-1 rounded-2xl border border-slate-800">
            <button
              onClick={() => setActiveTab('catalog')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'catalog'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Catálogo & Stock
            </button>
            <button
              onClick={() => setActiveTab('kardex')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'kardex'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Kardex de Movimientos
            </button>
          </div>

          {activeTab === 'catalog' && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-3.5 py-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Nuevo Producto
            </button>
          )}
        </div>
      </div>

      {/* Tarjetas Estadísticas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Total Productos</span>
            <Package className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-xl font-extrabold text-white">{totalProducts}</div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Stock Bajo / Agotado</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div
            className={`text-xl font-extrabold ${lowStockCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}
          >
            {lowStockCount}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Valorización (Costo)</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-extrabold text-emerald-400">
            {formatCurrency(totalStockValue)}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Margen Promedio</span>
            <TrendingUp className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-xl font-extrabold text-blue-400">{avgMargin}%</div>
        </div>
      </div>

      {/* PESTAÑA 1: CATÁLOGO & STOCK */}
      {activeTab === 'catalog' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
          {/* Filtros */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por código de barras o nombre de producto..."
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-3 py-1.5 rounded-xl font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  selectedCategory === 'all'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Todas
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCategory(c.id)}
                  className={`px-3 py-1.5 rounded-xl font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    selectedCategory === c.id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          {/* Tabla de Productos */}
          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="p-3">Código</th>
                  <th className="p-3">Producto</th>
                  <th className="p-3">Categoría</th>
                  <th className="p-3 text-center">Unidad</th>
                  <th className="p-3 text-right">Stock</th>
                  <th className="p-3 text-right">Costo (Admin)</th>
                  <th className="p-3 text-right">Precio Menor</th>
                  <th className="p-3 text-right">Precio Mayor</th>
                  <th className="p-3 text-right">Margen</th>
                  <th className="p-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {isLoading ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-slate-400">
                      Cargando inventario...
                    </td>
                  </tr>
                ) : products.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-slate-500">
                      No se encontraron productos.
                    </td>
                  </tr>
                ) : (
                  products.map((p) => {
                    const isLow = p.currentStock <= p.minStock;
                    const margin =
                      p.costPrice && p.costPrice > 0
                        ? (((p.retailPrice - p.costPrice) / p.costPrice) * 100).toFixed(1)
                        : '--';

                    return (
                      <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-3 font-mono text-[11px] text-slate-400">
                          {p.barcode || '--'}
                        </td>
                        <td className="p-3 font-bold text-white max-w-[220px] truncate">
                          {p.name}
                        </td>
                        <td className="p-3 text-slate-400">{p.category?.name || '--'}</td>
                        <td className="p-3 text-center">
                          <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-mono text-[10px]">
                            {p.unitType}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono font-bold">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] ${
                              isLow
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                : 'bg-emerald-500/15 text-emerald-400'
                            }`}
                          >
                            {p.currentStock}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono text-slate-300">
                          {formatCurrency(p.costPrice || 0)}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-white">
                          {formatCurrency(p.retailPrice)}
                        </td>
                        <td className="p-3 text-right font-mono text-amber-400">
                          {formatCurrency(p.wholesalePrice)}
                          <span className="text-[10px] text-slate-500 block">
                            (≥{p.wholesaleMinQty})
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono text-blue-400 font-semibold">
                          {margin}%
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setAdjustingProduct(p)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 transition-all cursor-pointer"
                              title="Ajustar Stock"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingProduct(p)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-400 transition-all cursor-pointer"
                              title="Editar Producto"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteProduct(p.id, p.name)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 transition-all cursor-pointer"
                              title="Desactivar Producto"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PESTAÑA 2: KARDEX DE MOVIMIENTOS */}
      {activeTab === 'kardex' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <History className="w-4 h-4 text-indigo-400" />
              Auditoría y Trazabilidad de Kardex (Últimos Movimientos)
            </h3>
            <span className="text-xs text-slate-500">{kardexList.length} registros</span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Producto</th>
                  <th className="p-3">Tipo Movimiento</th>
                  <th className="p-3 text-right">Cantidad</th>
                  <th className="p-3 text-right">Stock Anterior</th>
                  <th className="p-3 text-right">Stock Nuevo</th>
                  <th className="p-3 text-right">Costo Unit.</th>
                  <th className="p-3">Motivo / Operación</th>
                  <th className="p-3">Usuario</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {kardexList.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-500">
                      No hay registros en el Kardex aún.
                    </td>
                  </tr>
                ) : (
                  kardexList.map((m) => {
                    const isIncome =
                      m.movementType === 'PURCHASE' ||
                      m.movementType === 'RETURN_SALE' ||
                      m.movementType === 'ADJUSTMENT_IN';

                    return (
                      <tr key={m.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-3 font-mono text-[11px] text-slate-400">
                          {new Date(m.createdAt).toLocaleString()}
                        </td>
                        <td className="p-3 font-bold text-white">{m.productName}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 w-fit ${
                              isIncome
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            }`}
                          >
                            {isIncome ? (
                              <ArrowUpRight className="w-3 h-3" />
                            ) : (
                              <ArrowDownRight className="w-3 h-3" />
                            )}
                            {m.movementType}
                          </span>
                        </td>
                        <td
                          className={`p-3 text-right font-mono font-bold ${isIncome ? 'text-emerald-400' : 'text-rose-400'}`}
                        >
                          {isIncome ? '+' : '-'}
                          {m.quantity} {m.unitType}
                        </td>
                        <td className="p-3 text-right font-mono text-slate-400">{m.previousStock}</td>
                        <td className="p-3 text-right font-mono font-bold text-white">{m.newStock}</td>
                        <td className="p-3 text-right font-mono text-slate-300">
                          {formatCurrency(m.unitCost)}
                        </td>
                        <td className="p-3 text-slate-400 text-[11px] max-w-xs truncate">
                          {m.reason}
                        </td>
                        <td className="p-3 text-slate-300 font-medium">{m.userName}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL CREAR PRODUCTO */}
      {isCreateModalOpen && (
        <ProductFormModal
          isOpen={isCreateModalOpen}
          categories={categories}
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={() => {
            setIsCreateModalOpen(false);
            fetchProducts();
          }}
        />
      )}

      {/* MODAL EDITAR PRODUCTO */}
      {editingProduct && (
        <ProductFormModal
          isOpen={!!editingProduct}
          initialData={editingProduct}
          categories={categories}
          onClose={() => setEditingProduct(null)}
          onSuccess={() => {
            setEditingProduct(null);
            fetchProducts();
          }}
        />
      )}

      {/* MODAL AJUSTE DE STOCK */}
      {adjustingProduct && (
        <StockAdjustmentModal
          isOpen={!!adjustingProduct}
          product={adjustingProduct}
          onClose={() => setAdjustingProduct(null)}
          onSuccess={() => {
            setAdjustingProduct(null);
            fetchProducts();
          }}
        />
      )}
    </div>
  );
};

/* Sub-componente Modal de Creación / Edición de Producto */
interface ProductFormModalProps {
  isOpen: boolean;
  initialData?: Product | null;
  categories: Category[];
  onClose: () => void;
  onSuccess: () => void;
}

const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  initialData,
  categories,
  onClose,
  onSuccess,
}) => {
  const [barcode, setBarcode] = useState(initialData?.barcode || '');
  const [name, setName] = useState(initialData?.name || '');
  const [categoryId, setCategoryId] = useState(
    initialData?.categoryId || categories[0]?.id || '',
  );
  const [unitType, setUnitType] = useState<UnitType>(initialData?.unitType || 'UNIT');
  const [costPrice, setCostPrice] = useState(String(initialData?.costPrice || ''));
  const [retailPrice, setRetailPrice] = useState(String(initialData?.retailPrice || ''));
  const [wholesalePrice, setWholesalePrice] = useState(
    String(initialData?.wholesalePrice || ''),
  );
  const [wholesaleMinQty, setWholesaleMinQty] = useState(
    String(initialData?.wholesaleMinQty || '3'),
  );
  const [currentStock, setCurrentStock] = useState(String(initialData?.currentStock || '0'));
  const [minStock, setMinStock] = useState(String(initialData?.minStock || '5'));

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const payload: any = {
      barcode: barcode.trim() || undefined,
      name: name.trim(),
      categoryId,
      unitType,
      costPrice: parseFloat(costPrice) || 0,
      retailPrice: parseFloat(retailPrice) || 0,
      wholesalePrice: parseFloat(wholesalePrice) || 0,
      wholesaleMinQty: parseFloat(wholesaleMinQty) || 3,
      minStock: parseFloat(minStock) || 5,
    };

    if (!initialData) {
      payload.currentStock = parseFloat(currentStock) || 0;
    }

    try {
      if (initialData) {
        await apiRequest(`/products/${initialData.id}`, {
          method: 'PUT',
          data: payload,
        });
      } else {
        await apiRequest('/products', {
          method: 'POST',
          data: payload,
        });
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Error al guardar el producto');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl relative text-slate-100 max-h-[92vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute right-5 top-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-lg font-bold text-white mb-1">
          {initialData ? 'Editar Producto' : 'Registrar Nuevo Producto'}
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Ingrese los datos comerciales y de stock del producto.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="block font-semibold text-slate-300 mb-1">Código / Barcode:</label>
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Ej: 775123456789"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500"
              />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className="block font-semibold text-slate-300 mb-1">Categoría:</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500"
                required
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-300 mb-1">Nombre del Producto:</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Aceite Primor 1L"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500 font-bold"
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-300 mb-1">Unidad Medida:</label>
              <select
                value={unitType}
                onChange={(e) => setUnitType(e.target.value as UnitType)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-white outline-none focus:border-indigo-500"
              >
                <option value="UNIT">UNIDAD</option>
                <option value="KG">KILOGRAMO (KG)</option>
                <option value="MTR">METRO (MTR)</option>
                <option value="LT">LITRO (LT)</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1">Costo Compra S/.:</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                placeholder="0.00"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500 font-mono"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1">Precio Menor S/.:</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={retailPrice}
                onChange={(e) => setRetailPrice(e.target.value)}
                placeholder="0.00"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500 font-mono font-bold"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-300 mb-1">
                Precio Mayorista S/.:
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={wholesalePrice}
                onChange={(e) => setWholesalePrice(e.target.value)}
                placeholder="0.00"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-amber-400 outline-none focus:border-indigo-500 font-mono font-bold"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1">
                Cant. Mínima Mayorista:
              </label>
              <input
                type="number"
                step="1"
                min="1"
                value={wholesaleMinQty}
                onChange={(e) => setWholesaleMinQty(e.target.value)}
                placeholder="3"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500 font-mono"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {!initialData && (
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Stock Inicial:</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={currentStock}
                  onChange={(e) => setCurrentStock(e.target.value)}
                  placeholder="0"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500 font-mono font-bold"
                />
              </div>
            )}

            <div>
              <label className="block font-semibold text-slate-300 mb-1">
                Stock Mínimo Alerta:
              </label>
              <input
                type="number"
                step="1"
                min="0"
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
                placeholder="5"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500 font-mono"
              />
            </div>
          </div>

          <div className="pt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-semibold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold disabled:opacity-50"
            >
              {isLoading ? 'Guardando...' : 'Guardar Producto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* Sub-componente Modal Ajuste de Stock */
interface StockAdjustmentModalProps {
  isOpen: boolean;
  product: Product;
  onClose: () => void;
  onSuccess: () => void;
}

const StockAdjustmentModal: React.FC<StockAdjustmentModalProps> = ({
  isOpen,
  product,
  onClose,
  onSuccess,
}) => {
  const [newStockStr, setNewStockStr] = useState(String(product.currentStock));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentNum = product.currentStock;
  const newNum = parseFloat(newStockStr) || 0;
  const diff = newNum - currentNum;

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newNum < 0) {
      setError('El stock no puede ser negativo');
      return;
    }

    setIsLoading(true);
    try {
      await apiRequest(`/products/${product.id}`, {
        method: 'PUT',
        data: { currentStock: newNum },
      });
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Error al ajustar stock');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative text-slate-100">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
          <RotateCcw className="w-4 h-4 text-amber-400" />
          Ajuste Físico de Stock
        </h3>
        <p className="text-xs text-slate-400 mb-4">{product.name}</p>

        {error && (
          <div className="mb-3 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleAdjust} className="space-y-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex justify-between">
            <span className="text-slate-400">Stock Actual en Sistema:</span>
            <span className="font-mono font-bold text-white">
              {currentNum} {product.unitType}
            </span>
          </div>

          <div>
            <label className="block font-semibold text-slate-300 mb-1">
              Nuevo Stock Real Contado:
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={newStockStr}
              onChange={(e) => setNewStockStr(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-center text-lg font-mono font-bold text-white outline-none"
              required
            />
          </div>

          <div
            className={`p-2 rounded-xl text-center font-semibold text-[11px] ${
              diff > 0
                ? 'bg-emerald-500/10 text-emerald-400'
                : diff < 0
                  ? 'bg-rose-500/10 text-rose-400'
                  : 'bg-slate-800 text-slate-400'
            }`}
          >
            {diff > 0
              ? `Ingreso por ajuste: +${diff} ${product.unitType}`
              : diff < 0
                ? `Salida por ajuste: ${diff} ${product.unitType}`
                : 'Sin variación de stock'}
          </div>

          <div className="pt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading || diff === 0}
              className="flex-1 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold disabled:opacity-50"
            >
              {isLoading ? 'Guardando...' : 'Aplicar Ajuste'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
