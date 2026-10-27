import React, { useState } from 'react';
import { X, RotateCcw } from 'lucide-react';
import { apiRequest } from '../../../api/client.js';
import type { Product } from '../../../types/index.js';

export interface StockAdjustmentModalProps {
  isOpen: boolean;
  product: Product;
  onClose: () => void;
  onSuccess: () => void;
}

export const StockAdjustmentModal: React.FC<StockAdjustmentModalProps> = ({
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
              className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold cursor-pointer hover:bg-slate-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading || diff === 0}
              className="flex-1 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold disabled:opacity-50 cursor-pointer transition-colors"
            >
              {isLoading ? 'Guardando...' : 'Aplicar Ajuste'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
