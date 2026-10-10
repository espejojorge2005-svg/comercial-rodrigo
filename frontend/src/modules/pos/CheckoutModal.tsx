import React, { useState } from 'react';
import { useCartStore } from '../../store/useCartStore.js';
import { useShiftStore } from '../../store/useShiftStore.js';
import { apiRequest } from '../../api/client.js';
import { formatCurrency } from '../../lib/utils.js';
import {
  X,
  CreditCard,
  Banknote,
  QrCode,
  Layers,
  Coins,
  User,
  AlertCircle,
  Check,
} from 'lucide-react';
import { offlineStorage, type OfflineSale } from '../../lib/offlineStorage.js';
import { useOfflineSyncStore } from '../../store/useOfflineSyncStore.js';
import type { PaymentMethod } from '../../types/index.js';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaleSuccess: (saleData: any) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  onSaleSuccess,
}) => {
  const { activeShift } = useShiftStore();
  const {
    items,
    customerName,
    customerDocument,
    setCustomer,
    getTotalAmount,
    getTotalWholesaleSavings,
    clearCart,
  } = useCartStore();

  const totalAmount = getTotalAmount();
  const savings = getTotalWholesaleSavings();

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [cashPaid, setCashPaid] = useState<string>(String(totalAmount));
  const [digitalPaid, setDigitalPaid] = useState<string>('0');
  const [custName, setCustName] = useState<string>(customerName);
  const [custDoc, setCustDoc] = useState<string>(customerDocument);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const cashNum = parseFloat(cashPaid) || 0;
  const digitalNum = parseFloat(digitalPaid) || 0;

  // Cálculo del vuelto según método
  let changeAmount = 0;
  if (paymentMethod === 'CASH') {
    changeAmount = Math.max(0, Number((cashNum - totalAmount).toFixed(2)));
  } else if (paymentMethod === 'MIXED') {
    const requiredCash = Math.max(0, totalAmount - digitalNum);
    changeAmount = Math.max(0, Number((cashNum - requiredCash).toFixed(2)));
  }

  const handleSetExactCash = () => {
    if (paymentMethod === 'MIXED') {
      const remaining = Math.max(0, Number((totalAmount - digitalNum).toFixed(2)));
      setCashPaid(String(remaining));
    } else {
      setCashPaid(String(totalAmount));
    }
  };

  const handleAddCash = (amount: number) => {
    const current = parseFloat(cashPaid) || 0;
    setCashPaid(String(current + amount));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift) {
      setError('No hay un turno de caja activo para procesar la venta');
      return;
    }

    if (paymentMethod === 'CASH' && cashNum < totalAmount) {
      setError(`Efectivo insuficiente. Faltan ${formatCurrency(totalAmount - cashNum)}`);
      return;
    }

    if (paymentMethod === 'MIXED' && cashNum + digitalNum < totalAmount) {
      setError(
        `Monto total insuficiente. Pagado: ${formatCurrency(cashNum + digitalNum)}, Total: ${formatCurrency(totalAmount)}`,
      );
      return;
    }

    setIsLoading(true);
    setError(null);

    const processOfflineSale = async () => {
      const nowIso = new Date().toISOString();
      const offlineId = `off_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const offlineTicketNumber = `OFF-${String(Math.floor(Math.random() * 9000) + 1000)}`;

      const offlineSale: OfflineSale = {
        offlineId,
        offlineTicketNumber,
        cashShiftId: activeShift.id,
        shiftRegisterName: activeShift.cashRegister?.name || 'Caja',
        userId: activeShift.userId || '',
        userName: activeShift.user?.name || '',
        customerName: custName || 'Cliente Varios',
        customerDocument: custDoc || null,
        paymentMethod,
        cashPaid: paymentMethod === 'TRANSFER' || paymentMethod === 'CARD' ? 0 : cashNum,
        digitalPaid:
          paymentMethod === 'TRANSFER' || paymentMethod === 'CARD'
            ? totalAmount
            : paymentMethod === 'MIXED'
              ? digitalNum
              : 0,
        totalAmount,
        changeAmount,
        items: items.map((i) => ({
          productId: i.product.id,
          productName: i.product.name,
          unitType: i.product.unitType,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          isWholesaleApplied: i.isWholesaleApplied,
          subtotal: Number((i.quantity * i.unitPrice).toFixed(2)),
        })),
        createdAt: nowIso,
        syncStatus: 'PENDING',
      };

      await offlineStorage.saveOfflineSale(offlineSale);

      // Descontar stock localmente en IndexedDB
      for (const item of items) {
        await offlineStorage.decrementProductStock(item.product.id, item.quantity);
      }

      await useOfflineSyncStore.getState().refreshPendingCount();

      const syntheticSale = {
        id: offlineId,
        saleNumber: offlineTicketNumber,
        isOffline: true,
        customerName: custName || 'Cliente Varios',
        customerDocument: custDoc || null,
        paymentMethod,
        cashPaid: offlineSale.cashPaid,
        digitalPaid: offlineSale.digitalPaid,
        totalAmount,
        changeAmount,
        createdAt: nowIso,
        items: items.map((i) => ({
          productId: i.product.id,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          subtotal: Number((i.quantity * i.unitPrice).toFixed(2)),
          product: {
            id: i.product.id,
            name: i.product.name,
            barcode: i.product.barcode,
            unitType: i.product.unitType,
          },
        })),
        cashShift: activeShift,
        user: activeShift.user,
      };

      setCustomer(custName, custDoc);
      clearCart();
      setIsLoading(false);
      onSaleSuccess(syntheticSale);
      onClose();
    };

    // Si el navegador ya detectó que no hay internet, guardar directamente offline
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await processOfflineSale();
      return;
    }

    try {
      const payload = {
        cashShiftId: activeShift.id,
        customerName: custName || 'Cliente Varios',
        customerDocument: custDoc || null,
        paymentMethod,
        cashPaid: paymentMethod === 'TRANSFER' || paymentMethod === 'CARD' ? 0 : cashNum,
        digitalPaid:
          paymentMethod === 'TRANSFER' || paymentMethod === 'CARD'
            ? totalAmount
            : paymentMethod === 'MIXED'
              ? digitalNum
              : 0,
        changeAmount,
        items: items.map((i) => ({
          productId: i.product.id,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          isWholesaleApplied: i.isWholesaleApplied,
        })),
      };

      const res = await apiRequest('/sales', {
        method: 'POST',
        data: payload,
      });

      setCustomer(custName, custDoc);
      clearCart();
      setIsLoading(false);
      onSaleSuccess(res.sale);
      onClose();
    } catch (err: any) {
      const errMsg = err.message || '';
      const isConnectionIssue =
        errMsg.includes('Failed to fetch') ||
        errMsg.includes('NetworkError') ||
        errMsg.includes('Load failed') ||
        errMsg.includes('Network request failed') ||
        (typeof navigator !== 'undefined' && !navigator.onLine);

      if (isConnectionIssue) {
        // Fallback inmediato a venta offline
        await processOfflineSale();
      } else {
        setIsLoading(false);
        setError(errMsg || 'Error al procesar la venta');
      }
    }
  };

  const billButtons = [10, 20, 50, 100, 200];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-2xl relative text-slate-100 max-h-[92vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 sm:right-5 sm:top-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-lg sm:text-xl font-bold text-white mb-1 flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-blue-400" />
          Procesar Cobro
        </h3>
        <p className="text-xs text-slate-400 mb-4 sm:mb-5">
          Seleccione método de pago y registre el importe entregado por el cliente.
        </p>

        {error && (
          <div className="mb-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
          {/* Tarjeta del Total a Pagar (Sobria y Profesional) */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 font-medium block">Total a Cobrar</span>
              <span className="text-2xl sm:text-3xl font-extrabold text-white">
                {formatCurrency(totalAmount)}
              </span>
            </div>

            {savings > 0 && (
              <div className="text-right">
                <span className="text-[10px] text-amber-400 uppercase font-semibold block tracking-wider">
                  Ahorro Tarifa Mayorista
                </span>
                <span className="text-xs font-bold text-emerald-400">
                  -{formatCurrency(savings)}
                </span>
              </div>
            )}
          </div>

          {/* Selector de Método de Pago */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              Método de Pago
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: 'CASH', label: 'Efectivo', icon: Banknote },
                { id: 'TRANSFER', label: 'Yape / Plin', icon: QrCode },
                { id: 'CARD', label: 'Tarjeta', icon: CreditCard },
                { id: 'MIXED', label: 'Pago Mixto', icon: Layers },
              ].map((m) => {
                const Icon = m.icon;
                const isSelected = paymentMethod === m.id;
                return (
                  <button
                    type="button"
                    key={m.id}
                    onClick={() => {
                      setPaymentMethod(m.id as PaymentMethod);
                      if (m.id === 'CASH') {
                        setCashPaid(String(totalAmount));
                        setDigitalPaid('0');
                      } else if (m.id === 'MIXED') {
                        setDigitalPaid(String(Number((totalAmount / 2).toFixed(2))));
                        setCashPaid(String(Number((totalAmount / 2).toFixed(2))));
                      }
                    }}
                    className={`p-3 rounded-2xl border text-xs font-semibold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 border-blue-500 text-white shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Desglose de Pago (Efectivo / Mixto) */}
          {(paymentMethod === 'CASH' || paymentMethod === 'MIXED') && (
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-4">
              {paymentMethod === 'MIXED' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Monto Digital (Transferencia / Tarjeta)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">
                      S/.
                    </span>
                    <input
                      type="number"
                      step="any"
                      value={digitalPaid}
                      onChange={(e) => setDigitalPaid(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      className="w-full bg-slate-900 border border-slate-800 focus:border-indigo-500 rounded-xl pl-10 pr-4 py-2 text-sm font-bold text-white outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Coins className="w-3.5 h-3.5 text-amber-400" />
                    Efectivo Recibido en Gaveta
                  </label>
                  <button
                    type="button"
                    onClick={handleSetExactCash}
                    className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 cursor-pointer"
                  >
                    Monto exacto
                  </button>
                </div>

                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-base font-bold">
                    S/.
                  </span>
                  <input
                    type="number"
                    step="any"
                    value={cashPaid}
                    onChange={(e) => setCashPaid(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    required
                    className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl pl-12 pr-4 py-2.5 text-lg font-extrabold text-white outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>

              {/* Botones de billetes rápidos */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-400 mr-1">Sumar billete:</span>
                {billButtons.map((amt) => (
                  <button
                    type="button"
                    key={amt}
                    onClick={() => handleAddCash(amt)}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition-all cursor-pointer"
                  >
                    +{amt}
                  </button>
                ))}
              </div>

              {/* Cálculo del Vuelto */}
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">Vuelto a entregar:</span>
                <span
                  className={`text-xl font-extrabold ${
                    changeAmount > 0 ? 'text-emerald-400' : 'text-slate-400'
                  }`}
                >
                  {formatCurrency(changeAmount)}
                </span>
              </div>
            </div>
          )}

          {/* Datos del Cliente (Opcional) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Cliente (Opcional)
              </label>
              <div className="relative">
                <User className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={custName}
                  onChange={(e) => setCustName(e.target.value)}
                  placeholder="Cliente Varios"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl pl-8 pr-3 py-2 text-xs text-white outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                DNI / RUC (Opcional)
              </label>
              <input
                type="text"
                value={custDoc}
                onChange={(e) => setCustDoc(e.target.value)}
                placeholder="ej. 10458923011"
                className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl px-3 py-2 text-xs text-white outline-none font-mono"
              />
            </div>
          </div>

          {/* Botones de acción */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="w-1/3 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 font-semibold text-xs text-slate-300 transition-all cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isLoading}
              className="w-2/3 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold text-sm text-white shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Confirmar y Emitir Ticket</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
