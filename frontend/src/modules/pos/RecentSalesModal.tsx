import React, { useEffect, useState, useCallback } from 'react';
import { useShiftStore } from '../../store/useShiftStore.js';
import { apiRequest } from '../../api/client.js';
import { formatCurrency, formatPeruTime } from '../../lib/utils.js';
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
  FileText,
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
  const [printAsCreditNote, setPrintAsCreditNote] = useState<boolean>(false);

  // Estado para anulación de venta con PIN / emisión de Nota de Crédito
  const [saleToVoid, setSaleToVoid] = useState<any | null>(null);
  const [adminPin, setAdminPin] = useState<string>('');
  const [voidReason, setVoidReason] = useState<string>('');
  const [sunatReasonCode, setSunatReasonCode] = useState<string>('01');
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

    const isFiscal = saleToVoid.receiptType === 'BOLETA' || saleToVoid.receiptType === 'FACTURA';
    const reasonDescMap: Record<string, string> = {
      '01': '01 - ANULACIÓN DE LA OPERACIÓN',
      '02': '02 - ANULACIÓN POR ERROR EN EL RUC',
      '06': '06 - DEVOLUCIÓN TOTAL',
    };

    try {
      const res = await apiRequest(`/sales/${saleToVoid.id}/void`, {
        method: 'POST',
        data: {
          adminPin: adminPin.trim(),
          reason: voidReason.trim(),
          reasonCode: isFiscal ? sunatReasonCode : undefined,
          reasonDescription: isFiscal ? reasonDescMap[sunatReasonCode] || '01 - ANULACIÓN DE LA OPERACIÓN' : undefined,
        },
      });

      setVoidSuccess(res.message || 'Operación completada con éxito');
      await fetchSales();
      if (onSaleVoided) onSaleVoided();

      const savedVoidedSale = {
        ...saleToVoid,
        isVoided: true,
        voidedReason: voidReason.trim(),
        creditNote: res.creditNote,
      };

      setTimeout(() => {
        setSaleToVoid(null);
        setAdminPin('');
        setVoidReason('');
        setVoidSuccess(null);

        // Si se generó Nota de Crédito fiscal, abrir automáticamente el ticket de NC
        if (isFiscal && res.creditNote) {
          setSelectedSaleForPrint(savedVoidedSale);
          setPrintAsCreditNote(true);
        }
      }, 1200);
    } catch (err: any) {
      setVoidError(err.message || 'Error al procesar la anulación');
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
                          className={`w-auto min-w-[72px] px-2.5 h-10 rounded-xl flex flex-col items-center justify-center font-mono text-xs font-bold ${
                            sale.isVoided
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              : sale.receiptType === 'FACTURA'
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                : sale.receiptType === 'BOLETA'
                                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                  : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          }`}
                        >
                          <span className="text-[8.5px] uppercase font-sans font-bold tracking-wider">
                            {sale.receiptType === 'FACTURA'
                              ? 'Factura'
                              : sale.receiptType === 'BOLETA'
                                ? 'Boleta'
                                : 'Nota Venta'}
                          </span>
                          <span className="text-[11px] font-mono font-extrabold">
                            {sale.fullReceiptNumber || `${sale.series || 'NV01'}-${String(sale.correlativeNumber || sale.saleNumber).padStart(8, '0')}`}
                          </span>
                        </div>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-white">
                              {sale.customerName || 'Cliente Varios'}
                            </span>
                            {sale.isVoided ? (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 text-[10px] font-bold border border-rose-500/30 flex items-center gap-1">
                                  <Ban className="w-3 h-3" /> Anulada
                                </span>
                                {sale.creditNote && (
                                  <span className="px-2 py-0.5 rounded-full bg-rose-950/70 text-rose-300 text-[10px] font-mono font-bold border border-rose-700/50">
                                    NC: {sale.creditNote.fullNumber}
                                  </span>
                                )}
                              </div>
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
                            {formatPeruTime(sale.createdAt)} • Cajero:{' '}
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
                          {/* Botón Ver e Imprimir Nota de Crédito (si fue emitida) */}
                          {sale.creditNote && (
                            <button
                              onClick={() => {
                                setSelectedSaleForPrint(sale);
                                setPrintAsCreditNote(true);
                              }}
                              className="px-2.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 hover:text-white border border-rose-500/30 transition-all cursor-pointer flex items-center gap-1.5 text-[11px] font-bold shadow-sm"
                              title={`Ver e Imprimir Nota de Crédito ${sale.creditNote.fullNumber}`}
                            >
                              <FileText className="w-3.5 h-3.5 text-rose-400" />
                              <span className="hidden sm:inline">Ticket NC</span>
                            </button>
                          )}

                          {/* Botón Imprimir Ticket Original */}
                          <button
                            onClick={() => {
                              setSelectedSaleForPrint(sale);
                              setPrintAsCreditNote(false);
                            }}
                            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
                            title="Reimprimir Comprobante Original"
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
                                setSunatReasonCode('01');
                                setVoidError(null);
                              }}
                              className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-all cursor-pointer"
                              title={
                                sale.receiptType === 'NOTA_VENTA'
                                  ? 'Anular nota interna con PIN'
                                  : 'Emitir Nota de Crédito Electrónica'
                              }
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

                        {sale.isVoided && (
                          <div className="mt-2 p-2.5 rounded-xl bg-rose-950/40 border border-rose-900/40 text-[11px] text-rose-200 space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-rose-300">
                                {sale.creditNote
                                  ? `Nota de Crédito: ${sale.creditNote.fullNumber}`
                                  : 'Venta Anulada (Control Interno)'}
                              </span>
                              {sale.creditNote && (
                                <span className="text-[9.5px] bg-rose-500/20 px-2 py-0.5 rounded text-rose-300 border border-rose-500/30 font-semibold font-mono">
                                  {sale.creditNote.emissionStatus === 'SIMULATED' ? 'MOCK SUNAT' : 'ACEPTADO SUNAT'}
                                </span>
                              )}
                            </div>
                            {sale.creditNote && (
                              <div className="text-[10px] text-rose-300">
                                <strong>Motivo SUNAT:</strong> {sale.creditNote.reasonDescription}
                              </div>
                            )}
                            {sale.voidedReason && (
                              <div className="text-[10px] text-slate-400">
                                <strong>Justificación:</strong> {sale.voidedReason}
                              </div>
                            )}
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

      {/* SUB-MODAL DE ANULACIÓN / EMISIÓN DE NOTA DE CRÉDITO */}
      {saleToVoid && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-slate-900 border border-rose-500/30 rounded-3xl p-6 shadow-2xl relative text-slate-100 max-h-[92vh] overflow-y-auto">
            <button
              onClick={() => setSaleToVoid(null)}
              className="absolute right-4 top-4 p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {(() => {
              const isFiscalToVoid =
                saleToVoid.receiptType === 'BOLETA' || saleToVoid.receiptType === 'FACTURA';
              return (
                <>
                  <div className="text-center mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto mb-2">
                      {isFiscalToVoid ? (
                        <FileText className="w-6 h-6" />
                      ) : (
                        <ShieldAlert className="w-6 h-6" />
                      )}
                    </div>
                    <h4 className="text-base font-bold text-white">
                      {isFiscalToVoid
                        ? 'Emitir Nota de Crédito (SUNAT)'
                        : `Anular Venta #${saleToVoid.saleNumber}`}
                    </h4>
                    <p className="text-[11px] text-slate-300 mt-1">
                      {isFiscalToVoid ? (
                        <>
                          Modifica:{' '}
                          <strong className="text-white">
                            {saleToVoid.receiptType === 'FACTURA' ? 'Factura' : 'Boleta'}{' '}
                            {saleToVoid.fullReceiptNumber || saleToVoid.saleNumber}
                          </strong>{' '}
                          • El stock retornará automáticamente a Kardex.
                        </>
                      ) : (
                        <>
                          Monto: <strong>{formatCurrency(saleToVoid.totalAmount)}</strong> • Control interno con reingreso a Kardex.
                        </>
                      )}
                    </p>

                    {isFiscalToVoid && (
                      <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-[10.5px] font-mono text-indigo-300">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        Serie asignada: <strong className="text-white">{saleToVoid.receiptType === 'FACTURA' ? 'FC01' : 'BC01'}</strong> • Motor Simulador SUNAT Activo
                      </div>
                    )}
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

                  <form onSubmit={handleVoidSubmit} className="space-y-3.5">
                    {/* Selector de Catálogo 09 SUNAT (Solo si es Boleta o Factura) */}
                    {isFiscalToVoid && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Motivo SUNAT (Catálogo 09):
                        </label>
                        <select
                          value={sunatReasonCode}
                          onChange={(e) => setSunatReasonCode(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
                        >
                          <option value="01">01 - Anulación de la operación (Anulación Total)</option>
                          <option value="02">02 - Anulación por error en el RUC / Datos</option>
                          <option value="06">06 - Devolución total de mercadería</option>
                        </select>
                      </div>
                    )}

                    {/* Resumen financiero y de productos */}
                    <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] space-y-1">
                      <div className="flex justify-between text-slate-400">
                        <span>Total devuelto:</span>
                        <span className="font-extrabold text-rose-400">{formatCurrency(saleToVoid.totalAmount)}</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Productos a reingresar:</span>
                        <span className="font-bold text-slate-200">{saleToVoid.items?.length || 0} ítems</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Justificación / Sustento:
                      </label>
                      <input
                        type="text"
                        value={voidReason}
                        onChange={(e) => setVoidReason(e.target.value)}
                        placeholder="Ej: Cliente canceló la compra / Error de digitación"
                        className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 outline-none"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        PIN de Administrador (4 a 6 dígitos):
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
                        {isVoiding
                          ? 'Emitiendo...'
                          : isFiscalToVoid
                            ? 'Emitir Nota de Crédito'
                            : 'Confirmar Anulación'}
                      </button>
                    </div>
                  </form>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* MODAL DE VISTA E IMPRESIÓN DE TICKET */}
      {selectedSaleForPrint && (
        <ReceiptTicketModal
          isOpen={!!selectedSaleForPrint}
          onClose={() => {
            setSelectedSaleForPrint(null);
            setPrintAsCreditNote(false);
          }}
          saleData={selectedSaleForPrint}
          isCreditNoteTicket={printAsCreditNote}
        />
      )}
    </>
  );
};
