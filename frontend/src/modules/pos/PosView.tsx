import React from 'react';
import { useShiftStore } from '../../store/useShiftStore.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { formatCurrency } from '../../lib/utils.js';
import {
  ShoppingCart,
  CreditCard,
  Plus,
  Search,
  Tag,
  Clock,
} from 'lucide-react';

export const PosView: React.FC = () => {
  const { user } = useAuthStore();
  const { activeShift } = useShiftStore();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 text-slate-100">
      {/* Banner de Bienvenida del Turno */}
      <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-indigo-900/40 via-slate-900 to-slate-900 border border-indigo-500/20 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <ShoppingCart className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              Punto de Venta Activo • {activeShift?.cashRegister?.name}
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30">
                Operando
              </span>
            </h2>
            <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              Aperturado:{' '}
              {activeShift?.openedAt ? new Date(activeShift.openedAt).toLocaleTimeString() : '--'} •
              Cajero: <strong className="text-slate-300">{user?.name}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="px-3.5 py-2 rounded-xl bg-slate-950/80 border border-slate-800">
            <span className="text-slate-400 block text-[10px]">Fondo Inicial:</span>
            <span className="font-bold text-white">
              {formatCurrency(activeShift?.initialBalance || 0)}
            </span>
          </div>

          <div className="px-3.5 py-2 rounded-xl bg-slate-950/80 border border-slate-800">
            <span className="text-slate-400 block text-[10px]">Ventas Acumuladas:</span>
            <span className="font-bold text-emerald-400">
              {formatCurrency(activeShift?.metrics?.totalSales || 0)}
            </span>
          </div>
        </div>
      </div>

      {/* Grid del POS: Catálogo a la izquierda y Carrito a la derecha */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Catálogo de Productos (2 Columnas) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between gap-3 bg-slate-900 p-3 rounded-2xl border border-slate-800">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por código de barras o nombre..."
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 outline-none"
              />
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
              <button className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white font-semibold">
                Todos
              </button>
              <button className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white">
                Abarrotes
              </button>
              <button className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white">
                Bebidas
              </button>
              <button className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white">
                Limpieza
              </button>
            </div>
          </div>

          {/* Tarjetas de Producto Muestra */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {[
              {
                id: '1',
                name: 'Arroz Costeño Extra 1kg',
                retail: 4.8,
                wholesale: 4.3,
                minQty: 6,
                stock: 100,
                unit: 'UNIDAD',
              },
              {
                id: '2',
                name: 'Aceite Primor Premium 1L',
                retail: 11.0,
                wholesale: 9.8,
                minQty: 4,
                stock: 60,
                unit: 'UNIDAD',
              },
              {
                id: '3',
                name: 'Inca Kola 1.5L No Retornable',
                retail: 7.5,
                wholesale: 6.5,
                minQty: 6,
                stock: 80,
                unit: 'UNIDAD',
              },
              {
                id: '4',
                name: 'Detergente Bolívar 1kg',
                retail: 9.5,
                wholesale: 8.5,
                minQty: 3,
                stock: 50,
                unit: 'UNIDAD',
              },
            ].map((p) => (
              <div
                key={p.id}
                className="bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-2xl p-4 flex flex-col justify-between transition-all group cursor-pointer hover:shadow-lg hover:shadow-indigo-600/10"
              >
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-2">
                    <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 font-mono">
                      Stock: {p.stock}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-medium text-[10px]">
                      {p.unit}
                    </span>
                  </div>
                  <h4 className="font-bold text-white text-sm group-hover:text-indigo-300 transition-colors">
                    {p.name}
                  </h4>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-end justify-between">
                  <div>
                    <div className="text-base font-extrabold text-white">
                      {formatCurrency(p.retail)}
                    </div>
                    <div className="text-[10px] text-amber-400 font-semibold flex items-center gap-1">
                      <Tag className="w-3 h-3" />
                      Mayor: {formatCurrency(p.wholesale)} (≥{p.minQty})
                    </div>
                  </div>

                  <button className="w-8 h-8 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center transition-all shadow-md shadow-indigo-600/30">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Carrito de Compra (1 Columna) */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 flex flex-col justify-between h-[620px]">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-indigo-400" />
                Ticket de Venta
              </h3>
              <span className="text-xs text-slate-400 font-mono">#0001</span>
            </div>

            <div className="py-8 text-center text-slate-500 text-xs">
              <ShoppingCart className="w-10 h-10 mx-auto text-slate-600 mb-2 stroke-1" />
              El carrito está vacío.
              <p className="text-[11px] text-slate-600 mt-1">
                Haz clic en un producto o escanea su código de barras para agregarlo.
              </p>
            </div>
          </div>

          {/* Resumen y Cobro */}
          <div className="border-t border-slate-800 pt-4 space-y-3">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Subtotal:</span>
              <span>S/. 0.00</span>
            </div>
            <div className="flex justify-between text-lg font-extrabold text-white">
              <span>Total a Cobrar:</span>
              <span className="text-emerald-400">S/. 0.00</span>
            </div>

            <button
              disabled
              className="w-full py-3.5 rounded-2xl bg-slate-800 text-slate-500 font-bold text-sm cursor-not-allowed flex items-center justify-center gap-2"
            >
              <CreditCard className="w-4 h-4" />
              Cobrar Venta
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
