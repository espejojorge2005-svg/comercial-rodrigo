import React, { useState } from 'react';
import { X, Calendar } from 'lucide-react';
import { apiRequest } from '../../../api/client.js';
import type { Product, Category, UnitType } from '../../../types/index.js';
import { SUNAT_UNITS, isDiscreteUnitType } from '../../../lib/units.js';
import {
  addPeruDaysYMD,
  getPeruYMD,
  getProductExpirationInfo,
} from '../../../lib/utils.js';

function addMonthsFromPeruToday(monthsToAdd: number): string {
  const [yStr, mStr, dStr] = getPeruYMD().split('-');
  const d = new Date(Date.UTC(Number(yStr), Number(mStr) - 1 + monthsToAdd, Number(dStr), 12, 0, 0));
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export interface ProductFormModalProps {
  isOpen: boolean;
  initialData?: Product | null;
  categories: Category[];
  onClose: () => void;
  onSuccess: () => void;
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
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
  const [costPrice, setCostPrice] = useState(
    initialData?.costPrice != null ? String(initialData.costPrice) : '',
  );
  const [retailPrice, setRetailPrice] = useState(
    initialData?.retailPrice != null ? String(initialData.retailPrice) : '',
  );
  const [wholesalePrice, setWholesalePrice] = useState(
    initialData?.wholesalePrice != null ? String(initialData.wholesalePrice) : '',
  );
  const [wholesaleMinQty, setWholesaleMinQty] = useState(
    initialData?.wholesaleMinQty != null ? String(initialData.wholesaleMinQty) : '3',
  );
  const [currentStock, setCurrentStock] = useState(
    initialData?.currentStock != null ? String(initialData.currentStock) : '0',
  );
  const [minStock, setMinStock] = useState(
    initialData?.minStock != null ? String(initialData.minStock) : '5',
  );
  const [expirationDate, setExpirationDate] = useState<string>(
    initialData?.expirationDate
      ? typeof initialData.expirationDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(initialData.expirationDate)
        ? initialData.expirationDate.slice(0, 10)
        : new Date(initialData.expirationDate).toISOString().split('T')[0]
      : '',
  );

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isDiscrete = isDiscreteUnitType(unitType);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setError(null);

    if (!name.trim()) {
      setError('El nombre del producto es obligatorio');
      return;
    }

    const parsedCost = costPrice.trim() !== '' ? parseFloat(costPrice) : 0;
    const parsedRetail = retailPrice.trim() !== '' ? parseFloat(retailPrice) : 0;
    const parsedMinStock = minStock.trim() !== '' ? parseFloat(minStock) : 5;
    const parsedCurrentStock = currentStock.trim() !== '' ? parseFloat(currentStock) : 0;

    if (Number.isNaN(parsedRetail) || parsedRetail <= 0) {
      setError('El precio de venta menor debe ser mayor a S/ 0.00');
      return;
    }
    if (Number.isNaN(parsedCost) || parsedCost < 0) {
      setError('El costo de compra no puede ser negativo');
      return;
    }
    if (Number.isNaN(parsedMinStock) || parsedMinStock < 0) {
      setError('El stock mínimo no puede ser negativo');
      return;
    }
    if (!initialData) {
      if (Number.isNaN(parsedCurrentStock) || parsedCurrentStock < 0) {
        setError('El stock inicial no puede ser negativo');
        return;
      }
      if (isDiscrete && !Number.isInteger(parsedCurrentStock)) {
        setError(
          'Las unidades discretas (NIU, Caja, Paquete, Saco) no admiten decimales en el stock inicial',
        );
        return;
      }
    }

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
      barcode: barcode.trim() ? barcode.trim() : initialData ? null : undefined,
      name: name.trim(),
      categoryId,
      unitType,
      costPrice: Number(parsedCost.toFixed(2)),
      retailPrice: Number(parsedRetail.toFixed(2)),
      wholesalePrice: parsedWholesale !== null ? Number(parsedWholesale.toFixed(2)) : null,
      wholesaleMinQty: parsedMinQty,
      minStock: Number(parsedMinStock.toFixed(3)),
      expirationDate: expirationDate.trim() ? expirationDate.trim() : null,
    };

    if (!initialData) {
      payload.currentStock = Number(parsedCurrentStock.toFixed(3));
    }

    setIsLoading(true);

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
                  step={isDiscrete ? '1' : '0.001'}
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
                  onClick={() => setExpirationDate(addPeruDaysYMD(15))}
                  className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-medium border border-slate-700/60 transition-all cursor-pointer"
                >
                  +15 días
                </button>
                <button
                  type="button"
                  onClick={() => setExpirationDate(addMonthsFromPeruToday(1))}
                  className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-medium border border-slate-700/60 transition-all cursor-pointer"
                >
                  +1 mes
                </button>
                <button
                  type="button"
                  onClick={() => setExpirationDate(addMonthsFromPeruToday(6))}
                  className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-medium border border-slate-700/60 transition-all cursor-pointer"
                >
                  +6 meses
                </button>
                <button
                  type="button"
                  onClick={() => setExpirationDate(addMonthsFromPeruToday(12))}
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
              className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-semibold cursor-pointer hover:bg-slate-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold disabled:opacity-50 cursor-pointer transition-colors"
            >
              {isLoading ? 'Guardando...' : 'Guardar Producto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
