import React, { useEffect, useState, useCallback } from 'react';
import { useShiftStore } from '../../store/useShiftStore.js';
import { apiRequest } from '../../api/client.js';
import {
  addPeruDaysYMD,
  formatCurrency,
  formatPeruDateTime,
  getPeruYMD,
  sanitizeExternalUrl,
} from '../../lib/utils.js';
import {
  X,
  History,
  Printer,
  Ban,
  Search,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  FileText,
  ArrowRightLeft,
  Loader2,
  RefreshCw,
  Clock,
  Layers,
} from 'lucide-react';
import { ReceiptTicketModal } from './ReceiptTicketModal.js';
import { ConvertReceiptModal } from './ConvertReceiptModal.js';
import { useAuthStore } from '../../store/useAuthStore.js';

const PERU_FIXED_HOLIDAYS_MMDD = new Set([
  '01-01',
  '05-01',
  '06-07',
  '06-29',
  '07-23',
  '07-28',
  '07-29',
  '08-06',
  '08-30',
  '10-08',
  '11-01',
  '12-08',
  '12-09',
  '12-25',
]);

/**
 * 🛡️ Verifica si el plazo legal de SUNAT (15° día hábil del mes siguiente)
 * para emitir Nota de Crédito Electrónica por anulación (01/02) ya venció (R.S. 193-2020/SUNAT).
 */
export function checkSunatVoidDeadline(createdAt: string | Date): {
  isExpired: boolean;
  formattedDeadline: string;
} {
  const [year, monthOneBased] = getPeruYMD(createdAt).split('-').map(Number);
  const month = monthOneBased - 1; // 0 a 11

  let nextMonth = month + 1;
  let nextYear = year;
  if (nextMonth > 11) {
    nextMonth = 0;
    nextYear = year + 1;
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  let businessDaysCount = 0;
  let checkDay = 1;
  let deadlineDay = 1;

  while (businessDaysCount < 15 && checkDay <= 31) {
    const d = new Date(Date.UTC(nextYear, nextMonth, checkDay, 12, 0, 0));
    if (d.getUTCMonth() !== nextMonth) break;
    const dayOfWeek = d.getUTCDay();
    const mmdd = `${pad(nextMonth + 1)}-${pad(checkDay)}`;
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !PERU_FIXED_HOLIDAYS_MMDD.has(mmdd)) {
      businessDaysCount++;
      if (businessDaysCount === 15) {
        deadlineDay = checkDay;
        break;
      }
    }
    checkDay++;
  }

  const deadlineUtc = new Date(Date.UTC(nextYear, nextMonth, deadlineDay, 23 + 5, 59, 59, 999));
  const isExpired = Date.now() > deadlineUtc.getTime();
  const formattedDeadline = `${pad(deadlineDay)}/${pad(nextMonth + 1)}/${nextYear}`;

  return { isExpired, formattedDeadline };
}

interface RecentSalesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaleVoided?: () => void;
  initialScope?: 'shift' | 'all';
  initialFilter?: 'ALL' | 'NOTA_VENTA' | 'BOLETA' | 'FACTURA' | 'VOIDED';
}

type PeriodType = 'all' | 'today' | 'yesterday' | 'week' | 'month';
type ReceiptFilterType = 'ALL' | 'NOTA_VENTA' | 'BOLETA' | 'FACTURA' | 'VOIDED';

export const RecentSalesModal: React.FC<RecentSalesModalProps> = ({
  isOpen,
  onClose,
  onSaleVoided,
  initialScope = 'shift',
  initialFilter = 'ALL',
}) => {
  const { activeShift } = useShiftStore();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';

  // Ámbito de búsqueda: 'shift' (solo turno actual) o 'all' (todas las fechas y turnos)
  const [scope, setScope] = useState<'shift' | 'all'>(initialScope);

  // Periodo de tiempo cuando se busca en historial general
  const [datePeriod, setDatePeriod] = useState<PeriodType>('all');

  // Filtro por tipo de comprobante
  const [receiptFilter, setReceiptFilter] = useState<ReceiptFilterType>(initialFilter);

  const [sales, setSales] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);

  // Feedback de éxito
  const [successToast, setSuccessToast] = useState<string | null>(null);

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

  // Estado para canjear Nota de Venta a Boleta / Factura
  const [saleToConvert, setSaleToConvert] = useState<any | null>(null);
  const [isSearchingExternalTicket, setIsSearchingExternalTicket] = useState<boolean>(false);
  const [searchTicketError, setSearchTicketError] = useState<string | null>(null);
  const [reemittingNcId, setReemittingNcId] = useState<string | null>(null);
  const [reemittingSaleId, setReemittingSaleId] = useState<string | null>(null);

  // Helper para calcular fechas exactas en calendario peruano (America/Lima, UTC-5) sin desfase nocturno
  const getPeriodDates = (period: PeriodType) => {
    const todayStr = getPeruYMD();

    if (period === 'today') {
      return { startDate: todayStr, endDate: todayStr };
    }
    if (period === 'yesterday') {
      const yestStr = addPeruDaysYMD(-1);
      return { startDate: yestStr, endDate: yestStr };
    }
    if (period === 'week') {
      return { startDate: addPeruDaysYMD(-7), endDate: todayStr };
    }
    if (period === 'month') {
      const monthStart = `${todayStr.substring(0, 7)}-01`;
      return { startDate: monthStart, endDate: todayStr };
    }
    return { startDate: undefined, endDate: undefined };
  };

  const fetchSales = useCallback(async () => {
    setIsLoading(true);
    setSearchTicketError(null);
    try {
      const params: string[] = [];

      if (scope === 'shift') {
        if (activeShift?.id) {
          params.push(`shiftId=${activeShift.id}`);
        }
      } else {
        const { startDate, endDate } = getPeriodDates(datePeriod);
        if (startDate) params.push(`startDate=${startDate}`);
        if (endDate) params.push(`endDate=${endDate}`);
      }

      if (receiptFilter !== 'ALL' && receiptFilter !== 'VOIDED') {
        params.push(`receiptType=${receiptFilter}`);
      }
      if (receiptFilter === 'VOIDED') {
        params.push('isVoided=true');
      }

      if (searchTerm.trim()) {
        params.push(`search=${encodeURIComponent(searchTerm.trim())}`);
      }

      const queryString = params.length > 0 ? `?${params.join('&')}` : '';
      const data = await apiRequest(`/sales${queryString}`);
      setSales(data || []);
    } catch (err) {
      console.error('Error fetching sales:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeShift, scope, datePeriod, receiptFilter, searchTerm]);

  // Actualizar filtros iniciales cuando el modal se abre
  useEffect(() => {
    if (isOpen) {
      setScope(initialScope);
      setReceiptFilter(initialFilter);
      setSearchTerm('');
      setSuccessToast(null);
      setSearchTicketError(null);
    }
  }, [isOpen, initialScope, initialFilter]);

  // Carga reactiva de ventas
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      fetchSales();
    }, 150);
    return () => clearTimeout(timer);
  }, [isOpen, fetchSales]);

  if (!isOpen) return null;

  // Búsqueda directa y exacta por ticket
  const handleSearchExactTicket = async () => {
    const clean = searchTerm.trim();
    if (!clean) return;

    setIsSearchingExternalTicket(true);
    setSearchTicketError(null);
    try {
      const found = await apiRequest(`/sales/ticket/${encodeURIComponent(clean)}`);
      if (found) {
        if (found.receiptType !== 'NOTA_VENTA') {
          setSearchTicketError(
            `El comprobante ${found.fullReceiptNumber} ya fue emitido como ${found.receiptType}. Solo se pueden canjear Notas de Venta internas.`,
          );
        } else if (found.isVoided) {
          setSearchTicketError(`El ticket ${found.fullReceiptNumber} se encuentra anulado.`);
        } else {
          setSaleToConvert(found);
        }
      }
    } catch (err: any) {
      setSearchTicketError(err.message || 'No se encontró ningún comprobante con ese número.');
    } finally {
      setIsSearchingExternalTicket(false);
    }
  };

  const handleReemitCreditNote = async (saleId: string) => {
    if (reemittingNcId) return;
    setReemittingNcId(saleId);
    try {
      const res = await apiRequest(`/sales/${saleId}/reemit-credit-note`, {
        method: 'POST',
      });
      setSuccessToast(res?.message || 'Nota de Crédito reenviada a SUNAT correctamente.');
      await fetchSales();
    } catch (err: any) {
      setSearchTicketError(err?.message || 'No se pudo reenviar la Nota de Crédito a SUNAT.');
    } finally {
      setReemittingNcId(null);
    }
  };

  const handleReemitSale = async (saleId: string) => {
    if (reemittingSaleId) return;
    setReemittingSaleId(saleId);
    try {
      const res = await apiRequest<any>(`/sales/${saleId}/reemit-pending`, {
        method: 'POST',
      });
      setSuccessToast(res?.message || 'Comprobante reenviado a SUNAT correctamente.');
      await fetchSales();
    } catch (err: any) {
      setSearchTicketError(err?.message || 'No se pudo reenviar el comprobante a SUNAT.');
    } finally {
      setReemittingSaleId(null);
    }
  };

  const handleVoidSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saleToVoid || isVoiding || voidSuccess) return;

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
          reasonDescription: isFiscal
            ? reasonDescMap[sunatReasonCode] || '01 - ANULACIÓN DE LA OPERACIÓN'
            : undefined,
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

  const canjeableCount = sales.filter(
    (s) => !s.isVoided && s.receiptType === 'NOTA_VENTA' && !s.voidedReason?.startsWith('CANJE_TICKET:'),
  ).length;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl relative text-slate-100 flex flex-col max-h-[92vh]">
          {/* Header */}
          <div className="flex items-center justify-between pb-3.5 border-b border-slate-800 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600/15 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shadow-inner shrink-0">
                <History className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white leading-tight flex items-center gap-2">
                  <span>Historial de Ventas y Canje de Comprobantes</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-semibold border border-slate-700">
                    {scope === 'shift' ? 'Turno Actual' : 'Historial General'}
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Búsqueda de ventas anteriores para canje a Boleta o Factura oficial SUNAT
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={fetchSales}
                disabled={isLoading}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-50"
                title="Actualizar listado"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Banner Toast de Éxito al Canjear */}
          {successToast && (
            <div className="mt-3 p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between gap-2 shrink-0 animate-in fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-semibold">{successToast}</span>
              </div>
              <button
                onClick={() => setSuccessToast(null)}
                className="text-emerald-400 hover:text-emerald-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Selector de Ámbito y Periodo de Fechas */}
          <div className="mt-3.5 flex items-center justify-between gap-3 flex-wrap shrink-0">
            {/* Control Segmentado: Turno vs Historial */}
            <div className="inline-flex p-1 bg-slate-950 border border-slate-800 rounded-xl shrink-0">
              <button
                type="button"
                onClick={() => setScope('shift')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  scope === 'shift'
                    ? 'bg-slate-800 text-white shadow-sm border border-slate-700/80'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Turno Actual</span>
              </button>

              <button
                type="button"
                onClick={() => setScope('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  scope === 'all'
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Historial Completo</span>
              </button>
            </div>

            {/* Selector de periodo si está en Historial General */}
            {scope === 'all' && (
              <div className="inline-flex items-center p-1 bg-slate-950 border border-slate-800 rounded-xl shrink-0 gap-1 text-[11px]">
                {(
                  [
                    { id: 'all', label: 'Todo' },
                    { id: 'today', label: 'Hoy' },
                    { id: 'yesterday', label: 'Ayer' },
                    { id: 'week', label: '7 Días' },
                    { id: 'month', label: 'Este Mes' },
                  ] as { id: PeriodType; label: string }[]
                ).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setDatePeriod(p.id)}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                      datePeriod === p.id
                        ? 'bg-indigo-600/30 text-indigo-200 border border-indigo-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Filtros por tipo de comprobante (Segmented Bar Sobria y Formal) */}
          <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs shrink-0 min-h-[38px]">
            <button
              type="button"
              onClick={() => setReceiptFilter('ALL')}
              className={`h-8 px-3 rounded-xl font-medium transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                receiptFilter === 'ALL'
                  ? 'bg-slate-800 text-white border border-slate-700 shadow-sm font-semibold'
                  : 'bg-slate-950/70 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <span>Todos</span>
              <span className="px-1.5 py-0.2 rounded-md bg-slate-800 text-[10px] text-slate-300 font-mono">
                {sales.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setReceiptFilter('NOTA_VENTA')}
              className={`h-8 px-3 rounded-xl font-medium transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                receiptFilter === 'NOTA_VENTA'
                  ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40 shadow-sm font-semibold'
                  : 'bg-slate-950/70 text-slate-400 hover:text-amber-200 border border-slate-800'
              }`}
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400" />
              <span>Notas de Venta</span>
              {canjeableCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-md bg-amber-500/30 text-amber-200 text-[10px] font-semibold">
                  {canjeableCount} canjeables
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setReceiptFilter('BOLETA')}
              className={`h-8 px-3 rounded-xl font-medium transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                receiptFilter === 'BOLETA'
                  ? 'bg-indigo-500/20 text-indigo-200 border border-indigo-500/40 shadow-sm font-semibold'
                  : 'bg-slate-950/70 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <span>Boletas</span>
            </button>

            <button
              type="button"
              onClick={() => setReceiptFilter('FACTURA')}
              className={`h-8 px-3 rounded-xl font-medium transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                receiptFilter === 'FACTURA'
                  ? 'bg-purple-500/20 text-purple-200 border border-purple-500/40 shadow-sm font-semibold'
                  : 'bg-slate-950/70 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <span>Facturas</span>
            </button>

            <button
              type="button"
              onClick={() => setReceiptFilter('VOIDED')}
              className={`h-8 px-3 rounded-xl font-medium transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                receiptFilter === 'VOIDED'
                  ? 'bg-rose-500/20 text-rose-200 border border-rose-500/40 shadow-sm font-semibold'
                  : 'bg-slate-950/70 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <span>Anuladas</span>
            </button>
          </div>

          {/* Buscador inteligente */}
          <div className="my-3 space-y-2 shrink-0">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setSearchTicketError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSearchExactTicket();
                    }
                  }}
                  placeholder="Buscar por comprobante (ej: NV01-00000001, 15, B001...), cliente o documento..."
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition-all"
                />
              </div>

              {searchTerm.trim().length >= 1 && (
                <button
                  type="button"
                  onClick={handleSearchExactTicket}
                  disabled={isSearchingExternalTicket}
                  className="px-4 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 hover:text-white border border-amber-500/30 text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0 shadow-sm"
                  title="Buscar ticket exacto en base de datos"
                >
                  {isSearchingExternalTicket ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4 text-amber-400" />
                  )}
                  <span>Buscar Ticket</span>
                </button>
              )}
            </div>

            {searchTicketError && (
              <p className="text-xs text-rose-400 font-semibold px-1 flex items-center gap-1.5 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{searchTicketError}</span>
              </p>
            )}
          </div>

          {/* Listado de Ventas con scroll protegido */}
          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 min-h-0">
            {isLoading ? (
              <div className="py-14 text-center text-xs text-slate-400">
                <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mx-auto mb-2" />
                Cargando comprobantes...
              </div>
            ) : sales.length === 0 ? (
              <div className="py-14 text-center text-xs text-slate-500 space-y-2">
                <p>No se encontraron comprobantes con los filtros seleccionados.</p>
                {scope === 'shift' && (
                  <button
                    type="button"
                    onClick={() => setScope('all')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/20 text-indigo-300 hover:text-white border border-indigo-500/30 font-semibold transition-all cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Buscar en el Historial Completo</span>
                  </button>
                )}
              </div>
            ) : (
              sales.map((sale) => {
                const isExpanded = expandedSaleId === sale.id;
                const isCanjeable =
                  !sale.isVoided &&
                  sale.receiptType === 'NOTA_VENTA' &&
                  !sale.voidedReason?.startsWith('CANJE_TICKET:');
                const wasCanjeada = sale.voidedReason?.startsWith('CANJE_TICKET:');
                const isFiscal = sale.receiptType === 'BOLETA' || sale.receiptType === 'FACTURA';
                const sunatDeadline = isFiscal ? checkSunatVoidDeadline(sale.createdAt) : null;
                const isVoidDisabledBySunat = Boolean(isFiscal && sunatDeadline?.isExpired);

                return (
                  <div
                    key={sale.id}
                    className={`rounded-2xl border transition-all ${
                      sale.isVoided
                        ? 'bg-rose-950/20 border-rose-900/30'
                        : isCanjeable
                          ? 'bg-slate-950/70 border-amber-500/30 hover:border-amber-500/50'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="p-3.5 flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-auto min-w-[76px] px-2.5 h-10 rounded-xl flex flex-col items-center justify-center font-mono text-xs font-bold ${
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
                            {sale.fullReceiptNumber ||
                              `${sale.series || 'NV01'}-${String(sale.correlativeNumber || sale.saleNumber).padStart(8, '0')}`}
                          </span>
                        </div>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-white">
                              {sale.customerName || 'Cliente Varios'}
                            </span>
                            {sale.customerDocument && (
                              <span className="text-[10.5px] font-mono text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded">
                                {sale.customerDocument}
                              </span>
                            )}

                            {sale.isVoided ? (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 text-[10px] font-semibold border border-rose-500/30 flex items-center gap-1">
                                  <Ban className="w-3 h-3" /> Anulada
                                </span>
                                {sale.creditNote && (
                                  <span className="px-2 py-0.5 rounded-md bg-rose-950/70 text-rose-300 text-[10px] font-mono font-bold border border-rose-700/50">
                                    NC: {sale.creditNote.fullNumber}
                                  </span>
                                )}
                              </div>
                            ) : wasCanjeada ? (
                              <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[10px] font-medium border border-slate-700 flex items-center gap-1">
                                <ArrowRightLeft className="w-3 h-3 text-slate-400" /> Canjeado por {sale.voidedReason.replace('CANJE_TICKET:', '')}
                              </span>
                            ) : (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold border border-emerald-500/20">
                                  {sale.paymentMethod === 'CASH'
                                    ? 'Efectivo'
                                    : sale.paymentMethod === 'TRANSFER'
                                      ? 'Yape/Plin'
                                      : sale.paymentMethod === 'CARD'
                                        ? 'Tarjeta'
                                        : 'Pago Mixto'}
                                </span>
                                {isCanjeable && (
                                  <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 text-[10px] font-semibold border border-amber-500/30">
                                    Canjeable a Boleta/Factura
                                  </span>
                                )}
                                {(sale.receiptType === 'BOLETA' || sale.receiptType === 'FACTURA') && (
                                  <>
                                    {sale.emissionStatus === 'PENDING' && (
                                      <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 text-[10px] font-semibold border border-amber-500/30 flex items-center gap-1">
                                        <Clock className="w-3 h-3 text-amber-400" /> Pendiente SUNAT
                                      </span>
                                    )}
                                    {sale.emissionStatus === 'REJECTED' && (
                                      <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 text-[10px] font-semibold border border-rose-500/30 flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3 text-rose-400" /> Rechazado PSE
                                      </span>
                                    )}
                                  </>
                                )}
                                {!sale.isVoided && isVoidDisabledBySunat && (
                                  <span
                                    className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 text-[10px] font-semibold border border-amber-500/30 flex items-center gap-1"
                                    title={`El plazo reglamentario SUNAT para anular con Nota de Crédito venció el ${sunatDeadline?.formattedDeadline} (R.S. 193-2020/SUNAT)`}
                                  >
                                    <Clock className="w-3 h-3 text-amber-400" /> Plazo SUNAT Vencido
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {formatPeruDateTime(sale.createdAt, true)} • Caja:{' '}
                            <strong className="text-slate-300">{sale.cashRegister || sale.cashShift?.cashRegister?.name || 'Caja 1'}</strong> • Cajero:{' '}
                            {sale.user?.name || 'Cajero'}
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
                              className="px-2.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 hover:text-white border border-rose-500/30 transition-all cursor-pointer flex items-center gap-1.5 text-[11px] font-semibold shadow-sm"
                              title={`Ver e Imprimir Nota de Crédito ${sale.creditNote.fullNumber}`}
                            >
                              <FileText className="w-3.5 h-3.5 text-rose-400" />
                              <span className="hidden sm:inline">Ticket NC</span>
                            </button>
                          )}

                          {/* Botón Canjear Nota de Venta a Boleta o Factura */}
                          {isCanjeable && (
                            <button
                              onClick={() => setSaleToConvert(sale)}
                              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold border border-amber-400 transition-all cursor-pointer flex items-center gap-1.5 text-xs shadow-sm"
                              title="Canjear este ticket por Boleta o Factura Electrónica SUNAT"
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                              <span>Canjear Comprobante</span>
                            </button>
                          )}

                          {/* Botón Reenviar Comprobante a SUNAT si está PENDIENTE o RECHAZADO */}
                          {(sale.receiptType === 'BOLETA' || sale.receiptType === 'FACTURA') &&
                            !sale.isVoided &&
                            (sale.emissionStatus === 'PENDING' || sale.emissionStatus === 'REJECTED') && (
                              <button
                                type="button"
                                onClick={() => handleReemitSale(sale.id)}
                                disabled={reemittingSaleId === sale.id}
                                className="px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold border border-amber-400 transition-all cursor-pointer flex items-center gap-1.5 text-xs shadow-sm disabled:opacity-50"
                                title="Reintentar transmisión electrónica a SUNAT / PSE"
                              >
                                <RefreshCw
                                  className={`w-3.5 h-3.5 ${reemittingSaleId === sale.id ? 'animate-spin' : ''}`}
                                />
                                <span className="hidden sm:inline">Reenviar SUNAT</span>
                              </button>
                            )}

                          {/* Botón Imprimir Ticket Térmico */}
                          <button
                            onClick={() => {
                              setSelectedSaleForPrint(sale);
                              setPrintAsCreditNote(false);
                            }}
                            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
                            title="Reimprimir Comprobante Térmico"
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
                                setSunatReasonCode(isVoidDisabledBySunat ? '06' : '01');
                                setVoidError(null);
                              }}
                              className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-all cursor-pointer"
                              title={
                                sale.receiptType === 'NOTA_VENTA'
                                  ? 'Anular nota interna con PIN'
                                  : isVoidDisabledBySunat
                                    ? `Emitir Nota de Crédito por Devolución (06) — Plazo de anulación 01/02 venció el ${sunatDeadline?.formattedDeadline}`
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
                            title="Ver productos"
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

                        {(() => {
                          const safePdf = sanitizeExternalUrl(sale.pdfUrl);
                          const safeXml = sanitizeExternalUrl(sale.xmlUrl);
                          const safeCdr = sanitizeExternalUrl(sale.cdrUrl);
                          if (!safePdf && !(isAdmin && (safeXml || safeCdr))) return null;
                          return (
                            <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center gap-2 flex-wrap text-[10.5px]">
                              <span className="text-[10px] text-slate-400 font-semibold uppercase">
                                {isAdmin ? 'Archivos Fiscales (Admin):' : 'Comprobante:'}
                              </span>
                              {safePdf && (
                                <a
                                  href={safePdf}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2 py-0.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 font-medium transition-all"
                                >
                                  Descargar PDF
                                </a>
                              )}
                              {isAdmin && safeXml && (
                                <a
                                  href={safeXml}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2 py-0.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 font-mono text-[10px] transition-all"
                                >
                                  XML (UBL 2.1)
                                </a>
                              )}
                              {isAdmin && safeCdr && (
                                <a
                                  href={safeCdr}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2 py-0.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 font-mono text-[10px] transition-all"
                                >
                                  CDR (SUNAT)
                                </a>
                              )}
                            </div>
                          );
                        })()}

                        {sale.billingMessage && !sale.isVoided && (
                          <div className="mt-2 p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300 flex items-start gap-2">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                            <div>
                              <strong className="text-amber-400">Respuesta PSE / SUNAT:</strong>{' '}
                              <span className="font-mono">{sale.billingMessage}</span>
                            </div>
                          </div>
                        )}

                        {sale.isVoided && (
                          <div className="mt-2 p-2.5 rounded-xl bg-rose-950/40 border border-rose-900/40 text-[11px] text-rose-200 space-y-1">
                            <div className="flex justify-between items-center gap-2 flex-wrap">
                              <span className="font-bold text-rose-300">
                                {sale.creditNote
                                  ? `Nota de Crédito: ${sale.creditNote.fullNumber}`
                                  : 'Venta Anulada (Control Interno)'}
                              </span>
                              {sale.creditNote && (
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className={`text-[9.5px] px-2 py-0.5 rounded border font-semibold font-mono ${
                                      sale.creditNote.emissionStatus === 'PENDING' ||
                                      sale.creditNote.emissionStatus === 'REJECTED'
                                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                        : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                    }`}
                                  >
                                    {sale.creditNote.emissionStatus === 'SIMULATED'
                                      ? 'MOCK SUNAT'
                                      : sale.creditNote.emissionStatus === 'ACCEPTED'
                                        ? 'ACEPTADO SUNAT'
                                        : sale.creditNote.emissionStatus === 'PENDING'
                                          ? 'PENDIENTE SUNAT'
                                          : 'RECHAZADO SUNAT'}
                                  </span>
                                  {(sale.creditNote.emissionStatus === 'PENDING' ||
                                    sale.creditNote.emissionStatus === 'REJECTED') && (
                                    <button
                                      type="button"
                                      onClick={() => handleReemitCreditNote(sale.id)}
                                      disabled={reemittingNcId === sale.id}
                                      className="px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[10px] flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                      title="Reintentar envío de Nota de Crédito al PSE/SUNAT"
                                    >
                                      <RefreshCw
                                        className={`w-3 h-3 ${reemittingNcId === sale.id ? 'animate-spin' : ''}`}
                                      />
                                      <span>Reintentar NC</span>
                                    </button>
                                  )}
                                </div>
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
              const voidDeadline = isFiscalToVoid
                ? checkSunatVoidDeadline(saleToVoid.createdAt)
                : null;
              const isSunatExpired = Boolean(isFiscalToVoid && voidDeadline?.isExpired);
              const isInvalidReasonForDeadline =
                isSunatExpired && (sunatReasonCode === '01' || sunatReasonCode === '02');
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
                          Monto: <strong>{formatCurrency(saleToVoid.totalAmount)}</strong> • Control
                          interno con reingreso a Kardex.
                        </>
                      )}
                    </p>

                    {isFiscalToVoid && (
                      <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-[10.5px] font-mono text-indigo-300">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        Serie asignada:{' '}
                        <strong className="text-white">
                          {saleToVoid.receiptType === 'FACTURA' ? 'FC01' : 'BC01'}
                        </strong>
                      </div>
                    )}
                  </div>

                  {isFiscalToVoid && isSunatExpired && (
                    <div className="mb-3.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2.5 text-left">
                      <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-bold text-amber-200">
                          Plazo de anulación directa (01/02) vencido
                        </p>
                        <p className="text-[11px] text-amber-300/90 leading-relaxed">
                          Conforme a la <strong>R.S. 193-2020/SUNAT</strong>, la anulación directa
                          (códigos 01 y 02) venció el{' '}
                          <strong>{voidDeadline?.formattedDeadline}</strong>. Solo se permite emitir
                          Nota de Crédito por{' '}
                          <strong>06 - Devolución total de mercadería</strong>.
                        </p>
                      </div>
                    </div>
                  )}

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
                          <option value="01" disabled={isSunatExpired}>
                            01 - Anulación de la operación (Anulación Total)
                            {isSunatExpired ? ' (Plazo vencido)' : ''}
                          </option>
                          <option value="02" disabled={isSunatExpired}>
                            02 - Anulación por error en el RUC / Datos
                            {isSunatExpired ? ' (Plazo vencido)' : ''}
                          </option>
                          <option value="06">06 - Devolución total de mercadería</option>
                        </select>
                      </div>
                    )}

                    {/* Resumen financiero y de productos */}
                    <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] space-y-1">
                      <div className="flex justify-between text-slate-400">
                        <span>Total devuelto:</span>
                        <span className="font-extrabold text-rose-400">
                          {formatCurrency(saleToVoid.totalAmount)}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Productos a reingresar:</span>
                        <span className="font-bold text-slate-200">
                          {saleToVoid.items?.length || 0} ítems
                        </span>
                      </div>
                      {saleToVoid.paymentMethod === 'CASH' && (
                        <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-800/80">
                          ℹ️ El dinero devuelto se descuenta automáticamente del arqueo de caja al
                          anular. No registre un egreso manual para evitar doble resta.
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Justificación / Sustento:
                      </label>
                      <input
                        type="text"
                        value={voidReason}
                        onChange={(e) => setVoidReason(e.target.value)}
                        placeholder="Ej: Cliente canceló la compra / Devolución de producto"
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
                        disabled={isVoiding || Boolean(voidSuccess)}
                        className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-all cursor-pointer disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={isVoiding || Boolean(voidSuccess) || isInvalidReasonForDeadline}
                        className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/30 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {isVoiding
                          ? 'Emitiendo...'
                          : voidSuccess
                            ? 'Emitido ✓'
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

      {/* MODAL DE CANJE DE TICKET A BOLETA / FACTURA */}
      {saleToConvert && (
        <ConvertReceiptModal
          isOpen={!!saleToConvert}
          onClose={() => setSaleToConvert(null)}
          sale={saleToConvert}
          onSuccess={(updatedSale) => {
            fetchSales();
            setSuccessToast(
              `Ticket ${saleToConvert.fullReceiptNumber || saleToConvert.saleNumber} canjeado exitosamente por ${updatedSale.receiptType === 'FACTURA' ? 'Factura Electrónica' : 'Boleta Electrónica'} ${updatedSale.fullReceiptNumber}`,
            );
            setSelectedSaleForPrint(updatedSale);
            setPrintAsCreditNote(false);
            setSaleToConvert(null);
            if (onSaleVoided) onSaleVoided();
          }}
        />
      )}

      {/* MODAL DE VISTA E IMPRESIÓN DE TICKET TÉRMICO */}
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
