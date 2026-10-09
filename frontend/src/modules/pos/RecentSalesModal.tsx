import React, { useEffect, useState, useCallback } from 'react';
import { useShiftStore } from '../../store/useShiftStore.js';
import { apiRequest } from '../../api/client.js';
import { formatCurrency } from '../../lib/utils.js';
import {
  X,
  History,
  Printer,
  Ban,
  Search,
  CheckCircle,
  AlertCircle,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { ReceiptTicketModal } from './ReceiptTicketModal.js';

interface RecentSalesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaleVoided?: () => void;
}

export const RecentSalesModal: React.FC<RecentSalesModalProps> = ({
  isOpen,
  onClose,
  onSaleVoided,
}) => {
  const { activeShift } = useShiftStore();
  const [sales, setSales] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);

  // Estado para impresión de ticket
  const [selectedSaleForPrint, setSelectedSaleForPrint] = useState<any | null>(null);

  // Estado para anulación de venta con PIN
  const [saleToVoid, setSaleToVoid] = useState<any | null>(null);
  const [adminPin, setAdminPin] = useState<string>('');
  const [voidReason, setVoidReason] = useState<string>('');
  const [isVoiding, setIsVoiding] = useState<boolean>(false);
  const [voidError, setVoidError] = useState<string | null>(null);
  const [voidSuccess, setVoidSuccess] = useState<string | null>(null);

  const fetchSales = useCallback(async () => {
    if (!activeShift) return;
    setIsLoading(true);
    try {
      const data = await apiRequest(`/sales?shiftId=${activeShift.id}`);
      setSales(data || []);
    } catch (err) {
      console.error('Error fetching sales:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeShift]);

  useEffect(() => {
    if (isOpen) {
      fetchSales();
    }
  }, [isOpen, fetchSales]);

  if (!isOpen) return null;

  const filteredSales = sales.filter((s) => {
    const q = searchTerm.toLowerCase();
    const saleNumStr = String(s.saleNumber);
    const custName = (s.customerName || '').toLowerCase();
    return saleNumStr.includes(q) || custName.includes(q);
  });

  const handleVoidSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saleToVoid) return;

    if (!adminPin.trim()) {
      setVoidError('Ingrese el PIN de Administrador (ej: 1234)');
      return;
    }

    if (!voidReason.trim()) {
      setVoidError('Indique el motivo de la anulación');
      return;
    }

    setIsVoiding(true);
    setVoidError(null);

    try {
      const res = await apiRequest(`/sales/${saleToVoid.id}/void`, {
        method: 'POST',
        data: {
          adminPin: adminPin.trim(),
          reason: voidReason.trim(),
        },
      });

      setVoidSuccess(res.message || 'Venta anulada con éxito');
      await fetchSales();
      if (onSaleVoided) onSaleVoided();

      setTimeout(() => {
        setSaleToVoid(null);
        setAdminPin('');
        setVoidReason('');
        setVoidSuccess(null);
      }, 1500);
    } catch (err: any) {
      setVoidError(err.message || 'Error al anular la venta');
    } finally {
      setIsVoiding(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative text-slate-100 flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
                <History className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white leading-none">
                  Ventas Recientes del Turno
                </h3>
                <p className="text-[11px] text-slate-400 mt-1">
                  Caja: <strong className="text-slate-300">{activeShift?.cashRegister?.name}</strong> •
                  Total registradas: {sales.length}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Buscador */}
          <div className="my-4 relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por # de comprobante o cliente..."
              className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 outline-none transition-all"
            />
          </div>

          {/* Listado de Ventas */}
          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
            {isLoading ? (
              <div className="py-12 text-center text-xs text-slate-400">
                <div className="w-7 h-7 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mx-auto mb-2" />
                Cargando ventas del turno...
              </div>
            ) : filteredSales.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                No hay ventas registradas en este turno aún.
              </div>
            ) : (
              filteredSales.map((sale) => {
                const isExpanded = expandedSaleId === sale.id;
                return (
                  <div
                    key={sale.id}
                    className={`rounded-2xl border transition-all ${
                      sale.isVoided
                        ? 'bg-rose-950/20 border-rose-900/30'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="p-3.5 flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center font-mono text-xs font-bold ${
                            sale.isVoided
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              : 'bg-slate-800 text-indigo-300 border border-slate-700'
                          }`}
                        >
                          <span className="text-[9px] uppercase text-slate-400 font-sans font-normal">
                            Ticket
                          </span>
                          #{String(sale.saleNumber).padStart(4, '0')}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white">
                              {sale.customerName || 'Cliente Varios'}
                            </span>
                            {sale.isVoided ? (
                              <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 text-[10px] font-bold border border-rose-500/30 flex items-center gap-1">
                                <Ban className="w-3 h-3" /> Anulada
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold border border-emerald-500/20">
                                {sale.paymentMethod === 'CASH'
                                  ? 'Efectivo'
                                  : sale.paymentMethod === 'TRANSFER'
                                    ? 'Yape/Plin'
                                    : sale.paymentMethod === 'CARD'
                                      ? 'Tarjeta'
                                      : 'Pago Mixto'}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {new Date(sale.createdAt).toLocaleTimeString()} • Cajero:{' '}
                            {sale.user?.name}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div
                            className={`text-sm font-extrabold ${
                              sale.isVoided ? 'line-through text-slate-500' : 'text-emerald-400'
                            }`}
                          >
                            {formatCurrency(sale.totalAmount)}
                          </div>
                          <span className="text-[10px] text-slate-500">
                            {sale.items?.length || 0} producto(s)
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {/* Botón Imprimir Ticket */}
                          <button
                            onClick={() => setSelectedSaleForPrint(sale)}
                            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
                            title="Reimprimir Ticket"
                          >
                            <Printer className="w-4 h-4" />
                          </button>

                          {/* Botón Anular Venta (solo si no está anulada) */}
                          {!sale.isVoided && (
                            <button
                              onClick={() => {
                                setSaleToVoid(sale);
                                setAdminPin('');
                                setVoidReason('');
                                setVoidError(null);
                              }}
                              className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-all cursor-pointer"
                              title="Anular venta con PIN de Admin"
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                          )}

                          {/* Toggle Detalle */}
                          <button
                            onClick={() => setExpandedSaleId(isExpanded ? null : sale.id)}
                            className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white transition-all cursor-pointer"
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Detalle Desplegable */}
                    {isExpanded && (
                      <div className="px-4 pb-3 pt-1 border-t border-slate-800/80 bg-slate-900/40 text-xs">
                        <div className="space-y-1 mb-2">
                          {sale.items?.map((item: any) => (
                            <div
                              key={item.id}
                              className="flex justify-between text-slate-300 text-[11px]"
                            >
                              <span>
                                {item.quantity}x {item.productName || item.product?.name}
                              </span>
                              <span className="font-mono text-slate-400">
                                {formatCurrency(item.subtotal)}
                              </span>
                            </div>
                          ))}
                        </div>

                        {sale.isVoided && sale.voidedReason && (
                          <div className="mt-2 p-2 rounded-lg bg-rose-950/40 border border-rose-900/40 text-[10px] text-rose-300">
                            <strong>Motivo de anulación:</strong> {sale.voidedReason}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* SUB-MODAL DE CONFIRMACIÓN DE ANULACIÓN CON PIN ADMIN */}
      {saleToVoid && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-slate-900 border border-rose-500/30 rounded-3xl p-6 shadow-2xl relative text-slate-100">
            <button
              onClick={() => setSaleToVoid(null)}
              className="absolute right-4 top-4 p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto mb-2">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <h4 className="text-base font-bold text-white">Anular Venta #{saleToVoid.saleNumber}</h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Monto: <strong>{formatCurrency(saleToVoid.totalAmount)}</strong> • El stock retornará
                automáticamente a Kardex.
              </p>
            </div>

            {voidError && (
              <div className="mb-3 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{voidError}</span>
              </div>
            )}

            {voidSuccess && (
              <div className="mb-3 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{voidSuccess}</span>
              </div>
            )}

            <form onSubmit={handleVoidSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  PIN de Administrador:
                </label>
                <input
                  type="password"
                  maxLength={6}
                  value={adminPin}
                  onChange={(e) => setAdminPin(e.target.value)}
                  placeholder="PIN (ej: 1234)"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500 rounded-xl px-3.5 py-2.5 text-center text-lg font-mono font-bold tracking-widest text-white placeholder-slate-600 outline-none"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Motivo de la Anulación:
                </label>
                <input
                  type="text"
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="Ej: Error de digitación, cliente canceló"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 outline-none"
                  required
                />
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSaleToVoid(null)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isVoiding}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/30 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isVoiding ? 'Anulando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE VISTA E IMPRESIÓN DE TICKET */}
      {selectedSaleForPrint && (
        <ReceiptTicketModal
          isOpen={!!selectedSaleForPrint}
          onClose={() => setSelectedSaleForPrint(null)}
          saleData={selectedSaleForPrint}
        />
      )}
    </>
  );
};
