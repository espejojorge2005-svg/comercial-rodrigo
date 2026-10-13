import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../../api/client.js';
import { formatCurrency, formatPeruDateTime, getProductExpirationInfo } from '../../lib/utils.js';
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
  RefreshCw,
  Filter,
  FileSpreadsheet,
  Calendar,
  Clock,
  ArrowUpDown,
} from 'lucide-react';
import type { Product, Category, UnitType } from '../../types/index.js';
import { SUNAT_UNITS, getUnitBadge, getUnitShortName } from '../../lib/units.js';
import { useConfigStore } from '../../store/useConfigStore.js';
import { exportKardexAndInventoryExcel } from '../../lib/excelExport.js';

export const InventoryView: React.FC = () => {
  const { config } = useConfigStore();
  const [activeTab, setActiveTab] = useState<'catalog' | 'kardex'>('catalog');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [kardexList, setKardexList] = useState<any[]>([]);
  const [kardexProductFilter, setKardexProductFilter] = useState<string>('all');
  const [isKardexLoading, setIsKardexLoading] = useState<boolean>(false);
  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expirationFilter, setExpirationFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('name_asc');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Exportar a Excel en vivo (Stock Valorizado + Kardex + Alertas)
  const handleExportExcel = async () => {
    setIsExportingExcel(true);
    try {
      let currentKardex = kardexList;
      if (currentKardex.length === 0) {
        currentKardex = (await apiRequest('/products/kardex')) || [];
        setKardexList(currentKardex);
      }
      exportKardexAndInventoryExcel(products, currentKardex, config.name);
    } catch (err) {
      console.error(err);
    } finally {
      setIsExportingExcel(false);
    }
  };

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
      if (expirationFilter !== 'all') url += `expirationStatus=${encodeURIComponent(expirationFilter)}&`;
      if (sortBy !== 'name_asc') {
        if (sortBy === 'only_expired' || sortBy === 'only_expiring_soon') {
          url += `sortBy=expiration_asc&`;
        } else {
          url += `sortBy=${encodeURIComponent(sortBy)}&`;
        }
      }
      const data = await apiRequest(url);
      setProducts(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedCategory, searchTerm, expirationFilter, sortBy]);

  // Cargar Kardex con soporte de filtrado por producto y recarga en tiempo real
  const fetchKardex = useCallback(async (prodId?: string) => {
    setIsKardexLoading(true);
    try {
      const targetId = prodId !== undefined ? prodId : kardexProductFilter;
      const url = targetId && targetId !== 'all'
        ? `/products/kardex?productId=${encodeURIComponent(targetId)}`
        : '/products/kardex';
      const data = await apiRequest(url);
      setKardexList(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsKardexLoading(false);
    }
  }, [kardexProductFilter]);

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
  }, [activeTab, fetchProducts, fetchKardex, kardexProductFilter]);

  // Métricas de Almacén y Vencimiento
  const totalProducts = products.length;
  const lowStockCount = products.filter((p) => p.currentStock <= p.minStock).length;
  const expiredCount = products.filter((p) => {
    const info = getProductExpirationInfo(p.expirationDate);
    return info.state === 'EXPIRED';
  }).length;
  const expiringSoonCount = products.filter((p) => {
    const info = getProductExpirationInfo(p.expirationDate);
    return info.state === 'CRITICAL' || info.state === 'WARNING';
  }).length;
  const totalUnitsStock = products.reduce((acc, p) => acc + (p.currentStock || 0), 0);
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

  const kardexIncomeTotal = kardexList.reduce((acc, m) => {
    const isIncome =
      m.movementType === 'PURCHASE' ||
      m.movementType === 'RETURN_SALE' ||
      m.movementType === 'ADJUSTMENT_IN';
    return isIncome ? acc + (m.quantity || 0) : acc;
  }, 0);

  const kardexOutTotal = kardexList.reduce((acc, m) => {
    const isIncome =
      m.movementType === 'PURCHASE' ||
      m.movementType === 'RETURN_SALE' ||
      m.movementType === 'ADJUSTMENT_IN';
    return !isIncome ? acc + (m.quantity || 0) : acc;
  }, 0);

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
          <h2 className="text-lg sm:text-xl font-extrabold text-white flex items-center gap-2.5">
            <Package className="w-5 h-5 sm:w-6 sm:h-6 text-slate-300" />
            Gestión de Inventario & Kardex
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Control de existencias, márgenes de ganancia y trazabilidad para Comercial Rodrigo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Selector de Pestaña */}
          <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('catalog')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'catalog'
                  ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Catálogo & Stock
            </button>
            <button
              onClick={() => setActiveTab('kardex')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'kardex'
                  ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Kardex de Movimientos
            </button>
          </div>

          {/* Botón Exportar a Excel */}
          <button
            onClick={handleExportExcel}
            disabled={isExportingExcel || products.length === 0}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm disabled:opacity-50"
            title="Exportar Stock Valorizado y Kardex a Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>{isExportingExcel ? 'Generando...' : 'Exportar Excel'}</span>
          </button>

          {activeTab === 'catalog' && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Nuevo Producto
            </button>
          )}
        </div>
      </div>

      {/* Tarjetas Estadísticas Limpias y Espaciosas (4 Columnas) */}
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
            <span>Alertas (Stock & Venc.)</span>
            <AlertTriangle
              className={`w-4 h-4 ${
                expiredCount > 0
                  ? 'text-rose-400'
                  : lowStockCount > 0
                  ? 'text-amber-400'
                  : 'text-slate-500'
              }`}
            />
          </div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span
              className={`text-xl font-extrabold ${
                expiredCount > 0
                  ? 'text-rose-400'
                  : lowStockCount > 0
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            >
              {expiredCount > 0
                ? `${expiredCount} vencido${expiredCount > 1 ? 's' : ''}`
                : lowStockCount > 0
                ? `${lowStockCount} stock bajo`
                : 'Sin alertas'}
            </span>
            {lowStockCount > 0 && expiredCount > 0 && (
              <span className="text-[10px] text-amber-300 font-medium">
                • {lowStockCount} bajo stock
              </span>
            )}
            {expiredCount === 0 && expiringSoonCount > 0 && (
              <span className="text-[10px] text-amber-300 font-medium">
                ({expiringSoonCount} por vencer)
              </span>
            )}
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
          {/* Barra de Filtros Limpia y Despejada (Una Sola Fila) */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-5">
            {/* Buscador */}
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

            {/* Controles Compactos: Categoría + Ordenar por Vencimiento */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Filtro de Categoría */}
              <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs">
                <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="text-slate-400 text-[11px] font-medium hidden sm:inline">Categoría:</span>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="bg-transparent text-xs text-slate-200 outline-none font-medium cursor-pointer"
                >
                  <option value="all" className="bg-slate-900 text-white">Todas las categorías</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id} className="bg-slate-900 text-white">
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Selector de Ordenamiento / Filtro de Vencimiento */}
              <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs">
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="text-slate-400 text-[11px] font-medium hidden sm:inline">Ordenar:</span>
                <select
                  value={sortBy}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSortBy(val);
                    if (val === 'only_expired') {
                      setExpirationFilter('expired');
                    } else if (val === 'only_expiring_soon') {
                      setExpirationFilter('expiring_soon');
                    } else {
                      setExpirationFilter('all');
                    }
                  }}
                  className="bg-transparent text-xs text-slate-200 outline-none font-semibold cursor-pointer"
                >
                  <option value="expiration_asc" className="bg-slate-900 text-white">
                    ⏳ Vencimiento (Más próximo primero)
                  </option>
                  <option value="only_expiring_soon" className="bg-slate-900 text-white">
                    ⚠️ Solo Por Vencer (≤ 30 días)
                  </option>
                  <option value="only_expired" className="bg-slate-900 text-white">
                    🚨 Solo Ya Vencidos
                  </option>
                  <option value="name_asc" className="bg-slate-900 text-white">
                    Nombre (A - Z)
                  </option>
                  <option value="stock_asc" className="bg-slate-900 text-white">
                    Stock (Menor a Mayor)
                  </option>
                  <option value="stock_desc" className="bg-slate-900 text-white">
                    Stock (Mayor a Menor)
                  </option>
                  <option value="expiration_desc" className="bg-slate-900 text-white">
                    Vencimiento (Más lejano primero)
                  </option>
                </select>
              </div>
            </div>
          </div>

          {/* Tabla de Productos */}
          <div className="overflow-x-auto rounded-2xl border border-slate-800 max-h-[620px] shadow-inner">
            <table className="w-full text-left text-xs border-collapse min-w-[1180px]">
              <thead className="sticky top-0 z-10 bg-slate-950 shadow-sm border-b border-slate-800">
                <tr className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="p-3 w-28">Código</th>
                  <th className="p-3">Producto / Descripción</th>
                  <th className="p-3 w-32">Categoría</th>
                  <th className="p-3 text-center w-24">Unidad</th>
                  <th className="p-3 w-36">F. Vencimiento</th>
                  <th className="p-3 text-right w-24">Stock</th>
                  <th className="p-3 text-right w-28">Costo (Admin)</th>
                  <th className="p-3 text-right w-28">P. Menor</th>
                  <th className="p-3 text-right w-36">P. Mayor</th>
                  <th className="p-3 text-right w-24">Margen</th>
                  <th className="p-3 text-center w-36">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {isLoading ? (
                  <tr>
                    <td colSpan={11} className="p-10 text-center text-slate-400">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                        <span>Cargando catálogo de productos...</span>
                      </div>
                    </td>
                  </tr>
                ) : products.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-10 text-center text-slate-500">
                      No se encontraron productos registrados con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  products.map((p) => {
                    const isOutOfStock = p.currentStock <= 0;
                    const isLow = p.currentStock <= p.minStock && !isOutOfStock;
                    const margin =
                      p.costPrice && p.costPrice > 0
                        ? (((p.retailPrice - p.costPrice) / p.costPrice) * 100).toFixed(1)
                        : '--';
                    const expInfo = getProductExpirationInfo(p.expirationDate);

                    return (
                      <tr key={p.id} className="hover:bg-slate-800/40 even:bg-slate-950/25 transition-colors">
                        <td className="p-3 font-mono text-[11px] text-slate-400">
                          {p.barcode || <span className="text-slate-600">S/C</span>}
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-white max-w-[260px] truncate" title={p.name}>
                            {p.name}
                          </div>
                          {p.barcode && (
                            <span className="text-[10px] text-slate-500 font-mono sm:hidden">
                              {p.barcode}
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-slate-400 truncate max-w-[130px]">
                          {p.category?.name || '--'}
                        </td>
                        <td className="p-3 text-center">
                          <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 font-mono text-[10px] font-semibold whitespace-nowrap border border-indigo-500/20">
                            {getUnitBadge(p.unitType)}
                          </span>
                        </td>
                        <td className="p-3">
                          {expInfo.state === 'EXPIRED' ? (
                            <div className="flex flex-col gap-0.5" title={expInfo.label}>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono text-[10px] font-bold w-fit">
                                <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                                {expInfo.formattedDate}
                              </span>
                              <span className="text-[10px] text-rose-400 font-semibold truncate max-w-[130px]">
                                {expInfo.label}
                              </span>
                            </div>
                          ) : expInfo.state === 'CRITICAL' ? (
                            <div className="flex flex-col gap-0.5" title={expInfo.label}>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono text-[10px] font-bold w-fit">
                                <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                                {expInfo.formattedDate}
                              </span>
                              <span className="text-[10px] text-amber-400 font-semibold truncate max-w-[130px]">
                                {expInfo.label}
                              </span>
                            </div>
                          ) : expInfo.state === 'WARNING' ? (
                            <div className="flex flex-col gap-0.5" title={expInfo.label}>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-200 border border-amber-500/20 font-mono text-[10px] font-medium w-fit">
                                <Calendar className="w-3 h-3 text-amber-300 shrink-0" />
                                {expInfo.formattedDate}
                              </span>
                              <span className="text-[10px] text-slate-400 truncate max-w-[130px]">
                                {expInfo.label}
                              </span>
                            </div>
                          ) : expInfo.state === 'GOOD' ? (
                            <div className="flex flex-col gap-0.5" title={expInfo.label}>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-mono text-[10px] font-medium w-fit">
                                <Calendar className="w-3 h-3 text-emerald-400 shrink-0" />
                                {expInfo.formattedDate}
                              </span>
                              <span className="text-[10px] text-slate-400 truncate max-w-[130px]">
                                {expInfo.label}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-500 text-[10px] italic px-1.5 py-0.5 rounded bg-slate-950/60 border border-slate-800/80 inline-block">
                              No perecible
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right font-mono font-bold">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                              isOutOfStock
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : isLow
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20'
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
                        <td className="p-3 text-right font-mono">
                          {p.wholesalePrice != null && Number(p.wholesalePrice) > 0 ? (
                            <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                              <span className="font-bold text-amber-300">
                                {formatCurrency(p.wholesalePrice)}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono px-1 py-0.5 rounded bg-slate-800 border border-slate-700/60">
                                ≥{p.wholesaleMinQty || 3}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-600 text-[10px] italic">No aplica</span>
                          )}
                        </td>
                        <td className="p-3 text-right font-mono">
                          <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300 font-semibold border border-blue-500/20 text-[11px]">
                            {margin}%
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => {
                                setKardexProductFilter(p.id);
                                setActiveTab('kardex');
                              }}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700/80 transition-all cursor-pointer"
                              title="Ver Trazabilidad en Kardex"
                            >
                              <History className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setAdjustingProduct(p)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700/80 transition-all cursor-pointer"
                              title="Ajustar Stock"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingProduct(p)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 transition-all cursor-pointer"
                              title="Editar Producto"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteProduct(p.id, p.name)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-slate-700/80 transition-all cursor-pointer"
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
              {products.length > 0 && (
                <tfoot className="sticky bottom-0 bg-slate-950/95 border-t-2 border-slate-700 text-slate-200 font-semibold text-xs shadow-md">
                  <tr>
                    <td colSpan={5} className="p-3 font-bold uppercase tracking-wider text-[11px] text-white">
                      Totales Generales ({products.length} productos listados)
                    </td>
                    <td className="p-3 text-right font-mono font-extrabold text-emerald-400 text-sm">
                      {totalUnitsStock} u.
                    </td>
                    <td className="p-3 text-right font-mono font-extrabold text-white text-sm">
                      {formatCurrency(totalStockValue)}
                    </td>
                    <td colSpan={2} className="p-3 text-right text-[11px] text-slate-400">
                      Margen Promedio:
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-blue-400">
                      +{avgMargin}%
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* PESTAÑA 2: KARDEX DE MOVIMIENTOS */}
      {activeTab === 'kardex' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <History className="w-4 h-4 text-slate-300" />
                Auditoría y Trazabilidad de Kardex
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Seguimiento cronológico y automático de todas las ventas de cajeros, ingresos y ajustes.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Filtro por producto */}
              <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs">
                <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <select
                  value={kardexProductFilter}
                  onChange={(e) => setKardexProductFilter(e.target.value)}
                  className="bg-transparent text-xs text-slate-200 outline-none font-medium cursor-pointer max-w-[180px] sm:max-w-[220px] truncate"
                >
                  <option value="all" className="bg-slate-900 text-white">Todos los productos</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id} className="bg-slate-900 text-white">
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Botón de Actualizar Kardex */}
              <button
                onClick={() => fetchKardex()}
                disabled={isKardexLoading}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition-all cursor-pointer"
                title="Actualizar Kardex en tiempo real"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isKardexLoading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Actualizar</span>
              </button>

              <span className="text-[11px] text-slate-500 font-mono px-2 py-1 rounded-lg bg-slate-950 border border-slate-800/80">
                {kardexList.length} movs.
              </span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-800 max-h-[620px] shadow-inner">
            <table className="w-full text-left text-xs border-collapse min-w-[1100px]">
              <thead className="sticky top-0 z-10 bg-slate-950 shadow-sm border-b border-slate-800">
                <tr className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="p-3 w-40">Fecha y Hora</th>
                  <th className="p-3">Producto / Código</th>
                  <th className="p-3 w-36">Tipo Movimiento</th>
                  <th className="p-3 text-right w-28">Variación</th>
                  <th className="p-3 text-right w-24">Stk. Ant.</th>
                  <th className="p-3 text-right w-24">Stk. Nuevo</th>
                  <th className="p-3 text-right w-28">Costo Unit.</th>
                  <th className="p-3 w-44">Operación / Ref.</th>
                  <th className="p-3 w-32">Responsable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {kardexList.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-10 text-center text-slate-500">
                      No hay registros en el Kardex para los criterios seleccionados.
                    </td>
                  </tr>
                ) : (
                  kardexList.map((m) => {
                    const isIncome =
                      m.movementType === 'PURCHASE' ||
                      m.movementType === 'RETURN_SALE' ||
                      m.movementType === 'ADJUSTMENT_IN';

                    return (
                      <tr key={m.id} className="hover:bg-slate-800/40 even:bg-slate-950/25 transition-colors">
                        <td className="p-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                          {formatPeruDateTime(m.createdAt)}
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-white max-w-[240px] truncate" title={m.productName}>
                            {m.productName}
                          </div>
                          {m.barcode ? (
                            <span className="text-[10px] text-slate-500 font-mono">
                              {m.barcode}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-600 font-mono italic">
                              S/C
                            </span>
                          )}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          {m.movementType === 'SALE' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 w-fit bg-rose-500/15 text-rose-400 border border-rose-500/25">
                              <ArrowDownRight className="w-3 h-3" />
                              VENTA POS
                            </span>
                          )}
                          {m.movementType === 'RETURN_SALE' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 w-fit bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                              <ArrowUpRight className="w-3 h-3" />
                              DEV. / ANULACIÓN
                            </span>
                          )}
                          {m.movementType === 'PURCHASE' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 w-fit bg-blue-500/15 text-blue-400 border border-blue-500/25">
                              <ArrowUpRight className="w-3 h-3" />
                              COMPRA / INGRESO
                            </span>
                          )}
                          {m.movementType === 'ADJUSTMENT_IN' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 w-fit bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                              <ArrowUpRight className="w-3 h-3" />
                              AJUSTE (+)
                            </span>
                          )}
                          {m.movementType === 'ADJUSTMENT_OUT' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 w-fit bg-amber-500/15 text-amber-400 border border-amber-500/25">
                              <ArrowDownRight className="w-3 h-3" />
                              AJUSTE (-)
                            </span>
                          )}
                        </td>
                        <td
                          className={`p-3 text-right font-mono font-bold whitespace-nowrap ${
                            isIncome ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {isIncome ? '+' : '-'}
                          {m.quantity} {getUnitShortName(m.unitType)}
                        </td>
                        <td className="p-3 text-right font-mono text-slate-400 whitespace-nowrap">
                          {m.previousStock}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-white whitespace-nowrap">
                          {m.newStock}
                        </td>
                        <td className="p-3 text-right font-mono text-slate-300 whitespace-nowrap">
                          {formatCurrency(m.unitCost || 0)}
                        </td>
                        <td className="p-3 text-slate-300 text-[11px] max-w-[200px] truncate" title={m.reason}>
                          {m.reason || '--'}
                        </td>
                        <td className="p-3 text-slate-300 font-medium whitespace-nowrap">
                          {m.userName || 'Sistema'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {kardexList.length > 0 && (
                <tfoot className="sticky bottom-0 bg-slate-950/95 border-t-2 border-slate-700 text-slate-200 font-semibold text-xs shadow-md">
                  <tr>
                    <td colSpan={3} className="p-3 font-bold uppercase tracking-wider text-[11px] text-white">
                      Totales ({kardexList.length} movimientos de trazabilidad)
                    </td>
                    <td className="p-3 text-right font-mono text-xs">
                      <span className="text-emerald-400 font-bold block">+{kardexIncomeTotal} u.</span>
                      <span className="text-rose-400 font-bold block">-{kardexOutTotal} u.</span>
                    </td>
                    <td colSpan={5} className="p-3 text-slate-400 text-[11px]">
                      Auditoría integral de movimientos físicos
                    </td>
                  </tr>
                </tfoot>
              )}
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
  const [unitType, setUnitType] = useState<UnitType>(initialData?.unitType || 'NIU');
  const [costPrice, setCostPrice] = useState(String(initialData?.costPrice || ''));
  const [retailPrice, setRetailPrice] = useState(String(initialData?.retailPrice || ''));
  const [wholesalePrice, setWholesalePrice] = useState(
    initialData?.wholesalePrice != null ? String(initialData.wholesalePrice) : '',
  );
  const [wholesaleMinQty, setWholesaleMinQty] = useState(
    initialData?.wholesaleMinQty != null ? String(initialData.wholesaleMinQty) : '3',
  );
  const [currentStock, setCurrentStock] = useState(String(initialData?.currentStock || '0'));
  const [minStock, setMinStock] = useState(String(initialData?.minStock || '5'));
  const [expirationDate, setExpirationDate] = useState<string>(
    initialData?.expirationDate
      ? new Date(initialData.expirationDate).toISOString().split('T')[0]
      : '',
  );

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const parsedWholesale =
      wholesalePrice.trim() !== '' && parseFloat(wholesalePrice) > 0
        ? parseFloat(wholesalePrice)
        : null;
    const parsedMinQty =
      parsedWholesale !== null
        ? parseFloat(wholesaleMinQty) > 0
          ? parseFloat(wholesaleMinQty)
          : 3
        : null;

    const payload: any = {
      barcode: barcode.trim() || undefined,
      name: name.trim(),
      categoryId,
      unitType,
      costPrice: parseFloat(costPrice) || 0,
      retailPrice: parseFloat(retailPrice) || 0,
      wholesalePrice: parsedWholesale,
      wholesaleMinQty: parsedMinQty,
      minStock: parseFloat(minStock) || 5,
      expirationDate: expirationDate.trim() ? expirationDate.trim() : null,
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
              <label className="block font-semibold text-slate-300 mb-1">Unidad Medida (SUNAT):</label>
              <select
                value={unitType}
                onChange={(e) => setUnitType(e.target.value as UnitType)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-white outline-none focus:border-indigo-500 text-xs"
              >
                {SUNAT_UNITS.map((u) => (
                  <option key={u.code} value={u.code}>
                    {u.sunatCode} - {u.name} ({u.presentation})
                  </option>
                ))}
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
                Precio Mayorista S/. <span className="text-slate-500 font-normal">(Opcional)</span>:
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={wholesalePrice}
                onChange={(e) => setWholesalePrice(e.target.value)}
                placeholder="Dejar vacío si no aplica"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-amber-400 outline-none focus:border-indigo-500 font-mono font-bold"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1">
                Cant. Mínima Mayorista <span className="text-slate-500 font-normal">(Opcional)</span>:
              </label>
              <input
                type="number"
                step="1"
                min="1"
                value={wholesaleMinQty}
                onChange={(e) => setWholesaleMinQty(e.target.value)}
                placeholder="3"
                disabled={!wholesalePrice || parseFloat(wholesalePrice) <= 0}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500 font-mono disabled:opacity-40"
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

          {/* Campo Fecha de Vencimiento (Opcional) */}
          <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label className="font-semibold text-slate-200 flex items-center gap-1.5 text-xs">
                <Calendar className="w-4 h-4 text-amber-400" />
                Fecha de Vencimiento
                <span className="text-[11px] font-normal text-slate-400">(Opcional)</span>
              </label>

              {expirationDate && (
                <button
                  type="button"
                  onClick={() => setExpirationDate('')}
                  className="text-[11px] text-rose-400 hover:text-rose-300 font-semibold cursor-pointer underline"
                >
                  Quitar fecha (No perecible)
                </button>
              )}
            </div>

            <p className="text-[11px] text-slate-400 mb-2.5">
              Ingrese la fecha de caducidad si el producto es perecible (ej: yogurt, leche, embutidos). Si no vence, déjelo vacío.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-center">
              <div>
                <input
                  type="date"
                  value={expirationDate}
                  onChange={(e) => setExpirationDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700/80 focus:border-indigo-500 rounded-xl px-3 py-2 text-white outline-none text-xs font-mono"
                />
              </div>

              {/* Botones de sugerencia rápida */}
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + 15);
                    setExpirationDate(d.toISOString().split('T')[0]);
                  }}
                  className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-medium border border-slate-700/60 transition-all cursor-pointer"
                >
                  +15 días
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    d.setMonth(d.getMonth() + 1);
                    setExpirationDate(d.toISOString().split('T')[0]);
                  }}
                  className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-medium border border-slate-700/60 transition-all cursor-pointer"
                >
                  +1 mes
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    d.setMonth(d.getMonth() + 6);
                    setExpirationDate(d.toISOString().split('T')[0]);
                  }}
                  className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-medium border border-slate-700/60 transition-all cursor-pointer"
                >
                  +6 meses
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    d.setFullYear(d.getFullYear() + 1);
                    setExpirationDate(d.toISOString().split('T')[0]);
                  }}
                  className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-medium border border-slate-700/60 transition-all cursor-pointer"
                >
                  +1 año
                </button>
              </div>
            </div>

            {/* Vista previa del estado de vencimiento */}
            {expirationDate && (
              <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center gap-2">
                {(() => {
                  const info = getProductExpirationInfo(expirationDate);
                  return (
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className="text-slate-400">Estado proyectado:</span>
                      <span
                        className={`font-semibold px-2 py-0.5 rounded-md border ${
                          info.state === 'EXPIRED'
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                            : info.state === 'CRITICAL'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            : info.state === 'WARNING'
                            ? 'bg-amber-500/15 text-amber-200 border-amber-500/20'
                            : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20'
                        }`}
                      >
                        {info.label}
                      </span>
                    </div>
                  );
                })()}
              </div>
            )}
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
