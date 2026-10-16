import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../api/client.js';
import { formatCurrency, formatPeruDateTime } from '../../lib/utils.js';
import {
  X,
  Building2,
  Receipt,
  User,
  MapPin,
  Mail,
  Search,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ArrowRightLeft,
  ShieldCheck,
  Info,
} from 'lucide-react';
import type { Sale } from '../../types/index.js';

interface ConvertReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: Sale | null;
  onSuccess: (updatedSale: Sale) => void;
}

export const ConvertReceiptModal: React.FC<ConvertReceiptModalProps> = ({
  isOpen,
  onClose,
  sale,
  onSuccess,
}) => {
  const [targetType, setTargetType] = useState<'BOLETA' | 'FACTURA'>('BOLETA');
  const [custDoc, setCustDoc] = useState('');
  const [custName, setCustName] = useState('');
  const [custAddress, setCustAddress] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [isSearchingDoc, setIsSearchingDoc] = useState(false);
  const [lookupBadge, setLookupBadge] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && sale) {
      setTargetType('BOLETA');
      setCustDoc(sale.customerDocument || '');
      setCustName(sale.customerName && sale.customerName !== 'Cliente Varios' ? sale.customerName : '');
      setCustAddress(sale.customerAddress || '');
      setCustEmail(sale.customerEmail || '');
      setLookupBadge(null);
      setError(null);
    }
  }, [isOpen, sale]);

  if (!isOpen || !sale) return null;

  const totalNum = Number(sale.totalAmount);
  const taxableBase = Math.round((totalNum / 1.18) * 100) / 100;
  const igvAmount = Math.round((totalNum - taxableBase) * 100) / 100;
  const isHighValueBoleta = totalNum >= 700;

  // Consultar RUC o DNI en SUNAT / RENIEC automáticamente
  const handleLookupDocument = async () => {
    const docToSearch = custDoc.trim();
    if (docToSearch.length !== 8 && docToSearch.length !== 11) return;

    setIsSearchingDoc(true);
    setLookupBadge(null);
    setError(null);

    try {
      const data = await apiRequest<any>(`/sales/lookup-document/${docToSearch}`);
      if (data) {
        if (data.name) {
          setCustName(data.name);
        }
        if (data.address && (targetType === 'FACTURA' || !custAddress)) {
          setCustAddress(data.address);
        }
        if (data.documentType === 'RUC') {
          setLookupBadge(`✓ SUNAT: ${data.status || 'ACTIVO'} • ${data.condition || 'HABIDO'}`);
          if (targetType !== 'FACTURA') {
            setTargetType('FACTURA');
          }
        } else {
          setLookupBadge('✓ RENIEC: Nombre verificado');
          if (targetType !== 'BOLETA') {
            setTargetType('BOLETA');
          }
        }
      }
    } catch (err: any) {
      console.warn('Error al consultar documento:', err);
      setLookupBadge('⚠️ No se encontró en SUNAT/RENIEC (puedes ingresarlo manual)');
    } finally {
      setIsSearchingDoc(false);
    }
  };

  const handleConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const docTrimmed = custDoc.trim();
    const nameTrimmed = custName.trim();

    if (targetType === 'FACTURA') {
      if (!docTrimmed || docTrimmed.length !== 11) {
        setError('Para Factura Electrónica es obligatorio un RUC válido de 11 dígitos.');
        return;
      }
      if (!docTrimmed.startsWith('10') && !docTrimmed.startsWith('20')) {
        setError('El RUC debe comenzar con 10 o 20.');
        return;
      }
      if (!nameTrimmed) {
        setError('Para Factura Electrónica es obligatoria la Razón Social de la empresa.');
        return;
      }
    } else if (targetType === 'BOLETA') {
      if (isHighValueBoleta) {
        if (!docTrimmed || (docTrimmed.length !== 8 && docTrimmed.length !== 11)) {
          setError('Por normativa SUNAT, Boletas de S/ 700.00 a más requieren DNI o RUC obligatorio.');
          return;
        }
        if (!nameTrimmed) {
          setError('Por normativa SUNAT, se requieren los nombres y apellidos completos del cliente.');
          return;
        }
      }
    }

    setIsLoading(true);

    try {
      const res = await apiRequest<{
        message: string;
        originalTicketNumber: string;
        sale: Sale;
      }>(`/sales/${sale.id}/convert-receipt`, {
        method: 'POST',
        data: {
          targetReceiptType: targetType,
          customerDocument: docTrimmed || undefined,
          customerName: nameTrimmed || undefined,
          customerAddress: custAddress.trim() || undefined,
          customerEmail: custEmail.trim() || undefined,
        },
      });

      onSuccess(res.sale);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error al canjear el ticket');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative text-slate-100 max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Canjear Ticket a Comprobante Electrónico
              </h3>
              <p className="text-xs text-slate-400">
                Ticket original: <span className="font-mono font-bold text-amber-300">{sale.fullReceiptNumber || `${sale.series}-${sale.correlativeNumber}`}</span>
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

        {/* Contenido con scroll */}
        <div className="overflow-y-auto space-y-4 py-4 pr-1 text-xs">
          {/* Card Resumen de la Venta Original */}
          <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between">
            <div>
              <div className="text-[11px] text-slate-400 font-medium">
                Venta #{sale.saleNumber} • {formatPeruDateTime(sale.createdAt, true)}
              </div>
              <div className="text-[11px] text-slate-300 mt-0.5">
                {sale.items?.length || 0} producto(s) • Cajero: <strong className="text-slate-200">{sale.user?.name || 'Caja'}</strong>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Total a Canjear</div>
              <div className="text-lg font-black font-mono text-emerald-400">
                {formatCurrency(totalNum)}
              </div>
            </div>
          </div>

          {/* Selector de Tipo de Comprobante Destino */}
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2">
              Selecciona el Comprobante a Emitir
            </label>
            <div className="grid grid-cols-2 gap-3">
              {/* Opción Boleta */}
              <button
                type="button"
                onClick={() => {
                  setTargetType('BOLETA');
                  setError(null);
                }}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between relative ${
                  targetType === 'BOLETA'
                    ? 'bg-indigo-600/15 border-indigo-500 shadow-md ring-1 ring-indigo-500/40 text-white'
                    : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Receipt className={`w-4 h-4 ${targetType === 'BOLETA' ? 'text-indigo-400' : 'text-slate-500'}`} />
                  <span className="font-bold text-xs">Boleta de Venta</span>
                </div>
                <p className="text-[10.5px] text-slate-400 leading-snug">
                  Personas naturales con DNI o Clientes Varios
                </p>
                {targetType === 'BOLETA' && (
                  <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-indigo-400" />
                )}
              </button>

              {/* Opción Factura */}
              <button
                type="button"
                onClick={() => {
                  setTargetType('FACTURA');
                  setError(null);
                }}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between relative ${
                  targetType === 'FACTURA'
                    ? 'bg-purple-600/15 border-purple-500 shadow-md ring-1 ring-purple-500/40 text-white'
                    : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Building2 className={`w-4 h-4 ${targetType === 'FACTURA' ? 'text-purple-400' : 'text-slate-500'}`} />
                  <span className="font-bold text-xs">Factura Electrónica</span>
                </div>
                <p className="text-[10.5px] text-slate-400 leading-snug">
                  Para empresas con RUC 10 o 20 (Crédito Fiscal)
                </p>
                {targetType === 'FACTURA' && (
                  <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-purple-400" />
                )}
              </button>
            </div>
          </div>

          {/* Formulario de Datos del Cliente */}
          <form onSubmit={handleConvert} id="convert-receipt-form" className="space-y-3">
            {/* Input DNI / RUC con botón de consulta SUNAT */}
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                {targetType === 'FACTURA' ? 'RUC de la Empresa (11 dígitos) *' : 'DNI / RUC del Cliente'}
                {isHighValueBoleta && targetType === 'BOLETA' && (
                  <span className="text-amber-400 ml-1 font-semibold text-[10px]">
                    (Obligatorio para montos ≥ S/ 700.00)
                  </span>
                )}
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={custDoc}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 11);
                      setCustDoc(val);
                      if (val.length === 11 && targetType !== 'FACTURA') {
                        setTargetType('FACTURA');
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleLookupDocument();
                      }
                    }}
                    placeholder={targetType === 'FACTURA' ? 'Ej: 20601234567' : 'Ej: 71234567 o 10...'}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-600 outline-none transition-all font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleLookupDocument}
                  disabled={isSearchingDoc || (custDoc.trim().length !== 8 && custDoc.trim().length !== 11)}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 hover:text-white border border-indigo-500/30 font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer shrink-0"
                  title="Consultar automáticamente en base de datos SUNAT / RENIEC"
                >
                  {isSearchingDoc ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Search className="w-3.5 h-3.5" />
                  )}
                  <span>Buscar SUNAT</span>
                </button>
              </div>

              {lookupBadge && (
                <div className="mt-1.5 text-[11px] text-emerald-400 flex items-center gap-1 font-medium animate-in fade-in">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{lookupBadge}</span>
                </div>
              )}
            </div>

            {/* Razón Social / Nombre */}
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                {targetType === 'FACTURA' ? 'Razón Social de la Empresa *' : 'Nombres y Apellidos del Cliente'}
              </label>
              <input
                type="text"
                value={custName}
                onChange={(e) => setCustName(e.target.value)}
                placeholder={targetType === 'FACTURA' ? 'Razón Social completa' : 'Clientes Varios'}
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 outline-none transition-all"
              />
            </div>

            {/* Dirección Fiscal (Especialmente relevante para Facturas) */}
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-slate-500" />
                <span>Dirección Fiscal {targetType === 'FACTURA' ? '(Requerida para Factura)' : '(Opcional)'}</span>
              </label>
              <input
                type="text"
                value={custAddress}
                onChange={(e) => setCustAddress(e.target.value)}
                placeholder="Av. / Jr. / Calle / Distrito, Provincia"
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 outline-none transition-all"
              />
            </div>

            {/* Correo Electrónico (Opcional) */}
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1 flex items-center gap-1">
                <Mail className="w-3.5 h-3.5 text-slate-500" />
                <span>Correo Electrónico (Para envío del comprobante - Opcional)</span>
              </label>
              <input
                type="email"
                value={custEmail}
                onChange={(e) => setCustEmail(e.target.value)}
                placeholder="cliente@empresa.com"
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 outline-none transition-all"
              />
            </div>
          </form>

          {/* Desglose Tributario Oficial */}
          <div className="p-3 rounded-2xl bg-slate-950/50 border border-slate-800/80 space-y-1 text-[11px]">
            <div className="flex justify-between text-slate-400">
              <span>Op. Gravada (Base Imponible):</span>
              <span className="font-mono text-slate-300 font-bold">{formatCurrency(taxableBase)}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>I.G.V. (18%):</span>
              <span className="font-mono text-slate-300 font-bold">{formatCurrency(igvAmount)}</span>
            </div>
            <div className="flex justify-between text-white font-bold pt-1 border-t border-slate-800/80">
              <span>Importe Total:</span>
              <span className="font-mono text-emerald-400 text-xs font-black">{formatCurrency(totalNum)}</span>
            </div>
          </div>

          {/* Aviso de Seguridad de Inventario y Caja */}
          <div className="p-2.5 rounded-2xl bg-blue-950/30 border border-blue-900/40 text-[11px] text-blue-200 flex items-start gap-2 leading-relaxed">
            <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-blue-300">Control de Caja y Stock Protegidos:</strong> El dinero cobrado y las salidas de mercadería ya fueron contabilizados en la venta original. Este canje solo genera la serie electrónica fiscal ante SUNAT vinculada al ticket.
            </div>
          </div>

          {error && (
            <div className="p-2.5 rounded-2xl bg-rose-950/40 border border-rose-900/50 text-rose-300 text-[11px] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer con botones de acción */}
        <div className="pt-3 border-t border-slate-800 flex justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition-all cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="convert-receipt-form"
            disabled={isLoading}
            className={`px-5 py-2 rounded-xl text-white font-bold transition-all shadow-lg flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              targetType === 'FACTURA'
                ? 'bg-purple-600 hover:bg-purple-500 shadow-purple-600/30'
                : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30'
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Emitiendo con SUNAT...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>
                  Emitir {targetType === 'FACTURA' ? 'Factura' : 'Boleta'} y Canjear
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
