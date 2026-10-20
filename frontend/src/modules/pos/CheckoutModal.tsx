import React, { useState, useMemo, useEffect } from 'react';
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
  Receipt,
  FileText,
  Building2,
  AlertTriangle,
  MapPin,
  Sparkles,
  Mail,
  Search,
  Loader2,
  CheckCircle2,
  Percent,
} from 'lucide-react';
import { offlineStorage, type OfflineSale } from '../../lib/offlineStorage.js';
import { useOfflineSyncStore } from '../../store/useOfflineSyncStore.js';
import type { PaymentMethod, ReceiptType } from '../../types/index.js';

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

  // Tipo de comprobante: Por defecto NOTA_VENTA (Prioridad operativa)
  const [receiptType, setReceiptType] = useState<ReceiptType>('NOTA_VENTA');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [cashPaid, setCashPaid] = useState<string>(String(totalAmount));
  const [digitalPaid, setDigitalPaid] = useState<string>('0');
  const [cashPortion, setCashPortion] = useState<string>(String(totalAmount));
  const [custName, setCustName] = useState<string>(customerName || 'Cliente Varios');
  const [custDoc, setCustDoc] = useState<string>(customerDocument || '');
  const [custAddress, setCustAddress] = useState<string>('');
  const [custEmail, setCustEmail] = useState<string>('');
  const [isSearchingDoc, setIsSearchingDoc] = useState<boolean>(false);
  const [lookupBadge, setLookupBadge] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Cálculos fiscales calculados SIEMPRE en nivel superior (Cumpliendo reglas estrictas de React Hooks)
  const { taxableBase, igvAmount } = useMemo(() => {
    let base = 0;
    let igv = 0;
    (items || []).forEach((item) => {
      const subtotalItem = Number(item.subtotal ?? (item.quantity * item.unitPrice).toFixed(2));
      const valTotal = Number((subtotalItem / 1.18).toFixed(2));
      base += valTotal;
      igv += Number((subtotalItem - valTotal).toFixed(2));
    });
    return {
      taxableBase: Number(base.toFixed(2)),
      igvAmount: Number(igv.toFixed(2)),
    };
  }, [items]);

  // Sincronizar estado al abrir el modal de forma segura con useEffect (NUNCA durante el render)
  useEffect(() => {
    if (isOpen) {
      setCashPaid(String(totalAmount));
      setCashPortion(String(totalAmount));
      setDigitalPaid('0');
      setError(null);
      setLookupBadge(null);
      setIsLoading(false);
      setReceiptType('NOTA_VENTA');
      setPaymentMethod('CASH');
      setCustName(customerName || 'Cliente Varios');
      setCustDoc(customerDocument || '');
      setCustAddress('');
      setCustEmail('');
    }
  }, [isOpen, totalAmount, customerName, customerDocument]);

  // Función para consultar RUC o DNI en SUNAT / RENIEC automáticamente
  const handleLookupDocument = async (overrideDoc?: string) => {
    const docToSearch = (overrideDoc !== undefined ? overrideDoc : (custDoc || '')).trim();
    if (docToSearch.length !== 8 && docToSearch.length !== 11) return;

    setIsSearchingDoc(true);
    setLookupBadge(null);
    try {
      const data = await apiRequest<any>(`/sales/lookup-document/${docToSearch}`);
      if (data) {
        if (data.name) {
          setCustName(data.name);
        }
        if (data.address && (receiptType === 'FACTURA' || !custAddress)) {
          setCustAddress(data.address);
        }
        if (data.documentType === 'RUC') {
          setLookupBadge(`✓ SUNAT: ${data.status || 'ACTIVO'} • ${data.condition || 'HABIDO'}`);
        } else {
          setLookupBadge(data.source === 'RENIEC_LIVE' ? `✓ RENIEC: Nombre oficial verificado` : `✓ DNI`);
        }
      }
    } catch (err: any) {
      console.warn('Document lookup error:', err);
    } finally {
      setIsSearchingDoc(false);
    }
  };

  // Early return solo DESPUÉS de declarar todos los hooks
  if (!isOpen) return null;

  const cashNum = parseFloat(cashPaid) || 0;
  const digitalNum = parseFloat(digitalPaid) || 0;

  // Porción de efectivo requerida para cubrir la venta en Pago Mixto
  const requiredCash = Math.max(0, Number((totalAmount - digitalNum).toFixed(2)));

  // Cálculo del vuelto según método
  let changeAmount = 0;
  if (paymentMethod === 'CASH') {
    changeAmount = Math.max(0, Number((cashNum - totalAmount).toFixed(2)));
  } else if (paymentMethod === 'MIXED') {
    changeAmount = Math.max(0, Number((cashNum - requiredCash).toFixed(2)));
  }

  // Validaciones seguras contra nulos/indefinidos
  const safeDoc = custDoc || '';
  const safeName = custName || '';
  const safeAddress = custAddress || '';

  const isBoletaOver700 = receiptType === 'BOLETA' && totalAmount >= 700;
  const cleanCustDoc = safeDoc.trim();
  const rucDigitsOnly = safeDoc.replace(/\D/g, '');

  const isDocValidForBoleta =
    !isBoletaOver700 ||
    (cleanCustDoc.length >= 8 && cleanCustDoc.length <= 12);
  const isNameValidForBoleta =
    !isBoletaOver700 ||
    (safeName.trim().length >= 3 &&
      safeName.trim().toLowerCase() !== 'cliente varios' &&
      safeName.trim().toLowerCase() !== 'clientes varios');

  const validRucPrefixes = ['10', '20', '15', '17'];
  const isRucValidForFactura =
    receiptType !== 'FACTURA' ||
    (rucDigitsOnly.length === 11 &&
      validRucPrefixes.some((p) => rucDigitsOnly.startsWith(p)));

  const isNameValidForFactura =
    receiptType !== 'FACTURA' ||
    (safeName.trim().length >= 2 && safeName.trim().toLowerCase() !== 'cliente varios');

  const isAddressValidForFactura =
    receiptType !== 'FACTURA' || safeAddress.trim().length >= 3;

  // Determinar si el formulario es válido para procesar cobro
  let isFormValid = true;
  let validationMessage = '';

  if (receiptType === 'BOLETA' && isBoletaOver700) {
    if (!isDocValidForBoleta) {
      isFormValid = false;
      validationMessage = 'SUNAT exige DNI, Carnet de Extranjería o RUC (8 a 12 car.) para boletas ≥ S/ 700.00';
    } else if (!isNameValidForBoleta) {
      isFormValid = false;
      validationMessage = 'Ingrese los nombres y apellidos completos del cliente';
    }
  } else if (receiptType === 'FACTURA') {
    if (!isRucValidForFactura) {
      isFormValid = false;
      validationMessage = 'El RUC debe tener 11 dígitos e iniciar con 10, 20, 15 o 17';
    } else if (!isNameValidForFactura) {
      isFormValid = false;
      validationMessage = 'La Razón Social de la empresa es obligatoria para Factura';
    } else if (!isAddressValidForFactura) {
      isFormValid = false;
      validationMessage = 'La Dirección Fiscal es obligatoria para Factura';
    }
  }

  const handleDigitalChange = (val: string) => {
    setDigitalPaid(val);
    if (val === '') {
      setCashPortion(String(totalAmount));
      setCashPaid(String(totalAmount));
      return;
    }
    const dig = parseFloat(val);
    if (isNaN(dig)) return;
    const clampedDigital = Math.min(totalAmount, Math.max(0, dig));
    const remCash = Number((totalAmount - clampedDigital).toFixed(2));
    setCashPortion(String(remCash));
    setCashPaid(String(remCash));
  };

  const handleCashPortionChange = (val: string) => {
    setCashPortion(val);
    if (val === '') {
      setDigitalPaid(String(totalAmount));
      setCashPaid('0');
      return;
    }
    const csh = parseFloat(val);
    if (isNaN(csh)) return;
    const clampedCash = Math.min(totalAmount, Math.max(0, csh));
    const remDigital = Number((totalAmount - clampedCash).toFixed(2));
    setDigitalPaid(String(remDigital));
    setCashPaid(val);
  };

  const handleSplitFiftyFifty = () => {
    const half = Number((totalAmount / 2).toFixed(2));
    const otherHalf = Number((totalAmount - half).toFixed(2));
    setDigitalPaid(String(half));
    setCashPortion(String(otherHalf));
    setCashPaid(String(otherHalf));
  };

  const handleSetExactCash = () => {
    if (paymentMethod === 'MIXED') {
      setCashPaid(String(requiredCash));
    } else {
      setCashPaid(String(totalAmount));
    }
  };

  const handleAddCash = (amount: number) => {
    const current = parseFloat(cashPaid) || 0;
    setCashPaid(String(Number((current + amount).toFixed(2))));
  };

  // Atajo de teclado: Enter en Nota de Venta para cobro ultrarrápido
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading && isFormValid) {
      // Si está en un input multilínea o cancelando, ignorar
      if ((e.target as HTMLElement).tagName !== 'TEXTAREA') {
        handleSubmit(e);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift) {
      setError('No hay un turno de caja activo para procesar la venta');
      return;
    }

    if (!isFormValid) {
      setError(validationMessage);
      return;
    }

    if (paymentMethod === 'CASH' && cashNum < totalAmount) {
      setError(`Efectivo insuficiente. Faltan ${formatCurrency(totalAmount - cashNum)}`);
      return;
    }

    if (paymentMethod === 'MIXED') {
      if (cashNum + digitalNum < totalAmount) {
        setError(
          `Monto total insuficiente. Pagado: ${formatCurrency(cashNum + digitalNum)}, Total: ${formatCurrency(totalAmount)}`,
        );
        return;
      }
      if (cashNum < requiredCash) {
        setError(
          `Efectivo recibido en gaveta insuficiente. Se requiere al menos ${formatCurrency(requiredCash)} en efectivo para completar la venta (Faltan ${formatCurrency(requiredCash - cashNum)})`,
        );
        return;
      }
    }

    setIsLoading(true);
    setError(null);

    // Obtener serie tentativa según caja activa
    const registerIdentifier = activeShift.cashRegister?.identifier || 'POS-01';
    const boxMatch = registerIdentifier.match(/\d+/) || [1];
    const boxNum = String(boxMatch[0]).padStart(2, '0');
    let series = `NV${boxNum}`;
    if (receiptType === 'BOLETA') series = `B${boxNum.padStart(3, '0')}`;
    if (receiptType === 'FACTURA') series = `F${boxNum.padStart(3, '0')}`;

    const processOfflineSale = async () => {
      const nowIso = new Date().toISOString();
      const offlineId = `off_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const randomCorr = Math.floor(Math.random() * 9000) + 1000;
      const offlineTicketNumber = `${series}-${String(randomCorr).padStart(8, '0')}`;

      const offlineSale: OfflineSale = {
        offlineId,
        offlineTicketNumber,
        receiptType,
        series,
        correlativeNumber: randomCorr,
        fullReceiptNumber: offlineTicketNumber,
        isFiscal: receiptType !== 'NOTA_VENTA',
        taxableBase,
        igvAmount: receiptType !== 'NOTA_VENTA' ? igvAmount : 0,
        customerAddress: custAddress || null,
        customerEmail: custEmail.trim() || null,
        hash: receiptType !== 'NOTA_VENTA' ? `SIM-${Date.now().toString(16)}` : null,
        qrString: null,
        emissionStatus: receiptType !== 'NOTA_VENTA' ? 'SIMULATED' : null,
        cashShiftId: activeShift.id,
        shiftRegisterName: activeShift.cashRegister?.name || 'Caja',
        userId: activeShift.userId || '',
        userName: activeShift.user?.name || '',
        customerName:
          custName ||
          (receiptType === 'BOLETA'
            ? 'Clientes Varios'
            : receiptType === 'FACTURA'
              ? 'EMPRESA'
              : 'Cliente Varios'),
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
        saleNumber: randomCorr,
        receiptType,
        series,
        correlativeNumber: randomCorr,
        fullReceiptNumber: offlineTicketNumber,
        isFiscal: receiptType !== 'NOTA_VENTA',
        taxableBase,
        igvAmount: receiptType !== 'NOTA_VENTA' ? igvAmount : 0,
        customerAddress: custAddress || null,
        hash: offlineSale.hash,
        qrString: null,
        emissionStatus: offlineSale.emissionStatus,
        isOffline: true,
        customerName: offlineSale.customerName,
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
        receiptType,
        customerName:
          custName ||
          (receiptType === 'BOLETA'
            ? 'Clientes Varios'
            : receiptType === 'FACTURA'
              ? 'EMPRESA'
              : 'Cliente Varios'),
        customerDocument: custDoc || null,
        customerAddress: custAddress || null,
        customerEmail: custEmail.trim() || undefined,
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
        await processOfflineSale();
      } else {
        setIsLoading(false);
        setError(errMsg || 'Error al procesar la venta');
      }
    }
  };

  const billButtons = [10, 20, 50, 100, 200];

  return (
    <div
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-2xl relative text-slate-100 max-h-[94vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 sm:right-5 sm:top-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-1">
          <CreditCard className="w-5 h-5 text-blue-400" />
          <h3 className="text-lg sm:text-xl font-bold text-white">Procesar Cobro y Emisión</h3>
        </div>
        <p className="text-xs text-slate-400 mb-4 sm:mb-5">
          Seleccione el tipo de comprobante (Triple Vía) y registre el pago del cliente.
        </p>

        {error && (
          <div className="mb-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
          {/* SELECTOR DE TRIPLE VÍA DE COMPROBANTES */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-blue-400" />
                Tipo de Comprobante
              </label>
              <span className="text-[11px] text-slate-400 font-medium">
                {receiptType === 'NOTA_VENTA' && 'Serie interna: NV01 / NV02'}
                {receiptType === 'BOLETA' && 'Serie fiscal: B001 / B002'}
                {receiptType === 'FACTURA' && 'Serie fiscal: F001 / F002'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Opción 1: NOTA DE VENTA (PREDETERMINADO) */}
              <button
                type="button"
                onClick={() => setReceiptType('NOTA_VENTA')}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between relative ${
                  receiptType === 'NOTA_VENTA'
                    ? 'bg-blue-600/20 border-blue-500 text-white ring-2 ring-blue-500/30'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <div className="flex items-center gap-1.5 font-bold text-sm text-white">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span>Nota de Venta</span>
                  </div>
                  <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Rápido
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Ticket Interno mostrador. Sin folios fiscales. Despacho ágil en 1 toque.
                </p>
              </button>

              {/* Opción 2: BOLETA ELECTRÓNICA */}
              <button
                type="button"
                onClick={() => setReceiptType('BOLETA')}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  receiptType === 'BOLETA'
                    ? 'bg-indigo-600/20 border-indigo-500 text-white ring-2 ring-indigo-500/30'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <div className="flex items-center gap-1.5 font-bold text-sm text-white">
                    <FileText className="w-4 h-4 text-indigo-400" />
                    <span>Boleta Electrónica</span>
                  </div>
                  <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    Fiscal
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Cliente final. Clientes Varios o con DNI. QR y cálculo de IGV.
                </p>
              </button>

              {/* Opción 3: FACTURA ELECTRÓNICA */}
              <button
                type="button"
                onClick={() => setReceiptType('FACTURA')}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  receiptType === 'FACTURA'
                    ? 'bg-purple-600/20 border-purple-500 text-white ring-2 ring-purple-500/30'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <div className="flex items-center gap-1.5 font-bold text-sm text-white">
                    <Building2 className="w-4 h-4 text-purple-400" />
                    <span>Factura Electrónica</span>
                  </div>
                  <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    Fiscal
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Empresas con RUC. Exige Razón Social y Dirección Fiscal válida.
                </p>
              </button>
            </div>
          </div>

          {/* Tarjeta del Total a Pagar y Desglose Financiero */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-400 font-medium block">Total a Cobrar</span>
                <span className="text-2xl sm:text-3xl font-extrabold text-white">
                  {formatCurrency(totalAmount)}
                </span>
              </div>

              {receiptType !== 'NOTA_VENTA' ? (
                <div className="text-right text-xs space-y-0.5">
                  <div className="text-slate-400">
                    Op. Gravada: <span className="font-semibold text-slate-200">{formatCurrency(taxableBase)}</span>
                  </div>
                  <div className="text-slate-400">
                    IGV (18%): <span className="font-semibold text-indigo-400">{formatCurrency(igvAmount)}</span>
                  </div>
                  {savings > 0 && (
                    <div className="text-[11px] font-bold text-emerald-400">
                      Ahorro mayorista: -{formatCurrency(savings)}
                    </div>
                  )}
                </div>
              ) : (
                savings > 0 && (
                  <div className="text-right">
                    <span className="text-[10px] text-amber-400 uppercase font-semibold block tracking-wider">
                      Ahorro Tarifa Mayorista
                    </span>
                    <span className="text-xs font-bold text-emerald-400">
                      -{formatCurrency(savings)}
                    </span>
                  </div>
                )
              )}
            </div>
          </div>

          {/* ALERTA NORMATIVA SUNAT: Si Boleta es >= S/ 700.00 */}
          {receiptType === 'BOLETA' && isBoletaOver700 && (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
              <div>
                <strong className="font-bold block text-amber-200">
                  Exigencia Obligatoria SUNAT (Monto ≥ S/ 700.00)
                </strong>
                <span>
                  Por normativa tributaria, toda Boleta de Venta igual o superior a S/ 700.00 debe
                  identificar obligatoriamente al comprador con DNI, Carnet de Extranjería o RUC (8 a 12 caracteres) y nombres completos.
                </span>
              </div>
            </div>
          )}

          {/* INFORMACIÓN DE FACTURA: Requerimiento Estricto */}
          {receiptType === 'FACTURA' && (
            <div className="p-3.5 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs flex items-start gap-2.5">
              <Building2 className="w-4 h-4 shrink-0 text-purple-400 mt-0.5" />
              <div>
                <strong className="font-bold block text-purple-200">
                  Datos Fiscales de Factura (Empresas)
                </strong>
                <span>
                  Ingrese el RUC de 11 dígitos (iniciado en 10, 20, 15 o 17), Razón Social y Dirección Fiscal para habilitar la emisión.
                </span>
              </div>
            </div>
          )}

          {/* DATOS DEL CLIENTE (DINÁMICOS SEGÚN COMPROBANTE) */}
          <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
            <span className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
              {receiptType === 'FACTURA'
                ? 'Datos Fiscales del Cliente (Obligatorio)'
                : receiptType === 'BOLETA' && isBoletaOver700
                  ? 'Datos del Cliente (Obligatorio por monto ≥ S/ 700)'
                  : 'Datos del Cliente (Opcional)'}
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Documento (DNI o RUC) */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  {receiptType === 'FACTURA'
                    ? 'RUC (11 dígitos) *'
                    : receiptType === 'BOLETA' && isBoletaOver700
                      ? 'DNI / CE / RUC (8 a 12 car.) *'
                      : 'DNI / RUC / CE (Opcional)'}
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    maxLength={receiptType === 'FACTURA' ? 11 : 12}
                    value={custDoc}
                    onChange={(e) => {
                      const val = receiptType === 'FACTURA'
                        ? e.target.value.replace(/\D/g, '')
                        : e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                      setCustDoc(val);
                      setLookupBadge(null);
                      if (receiptType === 'FACTURA' && val.length === 11) {
                        handleLookupDocument(val);
                      } else if (receiptType === 'BOLETA' && (val.length === 8 || val.length === 11)) {
                        handleLookupDocument(val);
                      }
                    }}
                    placeholder={
                      receiptType === 'FACTURA'
                        ? 'ej. 20601234567'
                        : receiptType === 'BOLETA' && isBoletaOver700
                          ? 'DNI, CE o RUC (ej. 45892301)'
                          : 'ej. 45892301'
                    }
                    className={`w-full bg-slate-900 border rounded-xl pl-3 pr-10 py-2 text-xs text-white outline-none font-mono transition-all ${
                      (receiptType === 'BOLETA' && isBoletaOver700 && !isDocValidForBoleta) ||
                      (receiptType === 'FACTURA' && !isRucValidForFactura && custDoc.length > 0)
                        ? 'border-rose-500/70 focus:border-rose-500'
                        : 'border-slate-800 focus:border-blue-500'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => handleLookupDocument()}
                    disabled={isSearchingDoc || (custDoc.length !== 8 && custDoc.length !== 11)}
                    className="absolute right-1.5 p-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 disabled:opacity-30 transition-all cursor-pointer"
                    title="Consultar RUC / DNI en SUNAT"
                  >
                    {isSearchingDoc ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Search className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
                {lookupBadge && (
                  <span className="text-[10px] text-emerald-400 mt-1 block font-semibold animate-in fade-in">
                    {lookupBadge}
                  </span>
                )}
                {receiptType === 'FACTURA' && custDoc && !isRucValidForFactura && (
                  <span className="text-[10px] text-rose-400 mt-1 block">
                    Debe iniciar con 10, 20, 15 o 17 (11 dígitos)
                  </span>
                )}
                {receiptType === 'BOLETA' && isBoletaOver700 && !isDocValidForBoleta && (
                  <span className="text-[10px] text-rose-400 mt-1 block">
                    Ingrese DNI (8), Carnet de Extranjería o RUC (8 a 12 caracteres)
                  </span>
                )}
              </div>

              {/* Nombre / Razón Social */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  {receiptType === 'FACTURA'
                    ? 'Razón Social *'
                    : receiptType === 'BOLETA' && isBoletaOver700
                      ? 'Nombres y Apellidos *'
                      : 'Nombre de Cliente'}
                </label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={custName}
                    onChange={(e) => setCustName(e.target.value)}
                    placeholder={
                      receiptType === 'FACTURA'
                        ? 'Razón Social de la empresa'
                        : 'Cliente Varios'
                    }
                    className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl pl-8 pr-3 py-2 text-xs text-white outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Dirección Fiscal (Solo para Factura) */}
            {receiptType === 'FACTURA' && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Dirección Fiscal *
                </label>
                <div className="relative">
                  <MapPin className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={custAddress}
                    onChange={(e) => setCustAddress(e.target.value)}
                    placeholder="Av. Ejemplo 123, Distrito, Lima"
                    className="w-full bg-slate-900 border border-slate-800 focus:border-purple-500 rounded-xl pl-8 pr-3 py-2 text-xs text-white outline-none"
                  />
                </div>
              </div>
            )}

            {/* Correo Electrónico para Envío Automático de Comprobante (Opcional) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-slate-400">
                  {receiptType === 'FACTURA'
                    ? 'Correo para Facturación (Opcional)'
                    : 'Correo del Cliente (Opcional)'}
                </label>
                <span className="text-[9.5px] text-slate-500">
                  Envío automático de PDF + XML por API
                </span>
              </div>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={custEmail}
                  onChange={(e) => setCustEmail(e.target.value)}
                  placeholder="ej. cliente@empresa.com"
                  className="w-full bg-slate-900 border border-slate-800 focus:border-indigo-500 rounded-xl pl-8 pr-3 py-2 text-xs text-white outline-none font-sans"
                />
              </div>
            </div>
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
                        setCashPortion(String(totalAmount));
                        setDigitalPaid('0');
                      } else if (m.id === 'TRANSFER' || m.id === 'CARD') {
                        setCashPaid('0');
                        setCashPortion('0');
                        setDigitalPaid(String(totalAmount));
                      } else if (m.id === 'MIXED') {
                        const half = Number((totalAmount / 2).toFixed(2));
                        const otherHalf = Number((totalAmount - half).toFixed(2));
                        setDigitalPaid(String(half));
                        setCashPortion(String(otherHalf));
                        setCashPaid(String(otherHalf));
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

          {/* Desglose de Pago (Solo Efectivo) */}
          {paymentMethod === 'CASH' && (
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-4">
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
                    Monto exacto ({formatCurrency(totalAmount)})
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

          {/* Desglose Formal de Pago Mixto (Cálculo Automático Bidireccional) */}
          {paymentMethod === 'MIXED' && (
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
              {/* Encabezado Formal con Presets */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                      Liquidación de Pago Mixto
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Total de la venta:{' '}
                      <span className="font-bold text-slate-100">{formatCurrency(totalAmount)}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleSplitFiftyFifty}
                    className="px-2.5 py-1 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/80 border border-indigo-500/30 text-[11px] font-bold text-indigo-300 transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                    title="Dividir en partes iguales: 50% digital y 50% efectivo"
                  >
                    <Percent className="w-3 h-3 text-indigo-400" />
                    50% / 50%
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDigitalPaid(String(totalAmount));
                      setCashPortion('0');
                      setCashPaid('0');
                    }}
                    className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] font-semibold text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
                    title="Asignar todo el monto a Tarjeta / Digital"
                  >
                    100% Digital
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDigitalPaid('0');
                      setCashPortion(String(totalAmount));
                      setCashPaid(String(totalAmount));
                    }}
                    className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] font-semibold text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
                    title="Asignar todo el monto a Efectivo"
                  >
                    100% Efectivo
                  </button>
                </div>
              </div>

              {/* Grid Bidireccional de Montos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. Monto Digital */}
                <div className="bg-slate-900/90 border border-indigo-500/30 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 rounded-xl p-3.5 transition-all">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-indigo-400" />
                      1. Monto Digital (Tarjeta / Yape)
                    </label>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300">
                      {totalAmount > 0 ? ((digitalNum / totalAmount) * 100).toFixed(0) : 0}%
                    </span>
                  </div>
                  <p className="text-[10.5px] text-slate-400 mb-2">
                    Cobro por POS físico, QR o Transferencia
                  </p>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-400 text-sm font-bold">
                      S/.
                    </span>
                    <input
                      type="number"
                      step="any"
                      value={digitalPaid}
                      onChange={(e) => handleDigitalChange(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      placeholder="0.00"
                      className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg pl-10 pr-3 py-2 text-base font-extrabold text-white outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                </div>

                {/* 2. Porción a Cubrir en Efectivo */}
                <div className="bg-slate-900/90 border border-emerald-500/30 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 rounded-xl p-3.5 transition-all">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                      <Coins className="w-3.5 h-3.5 text-emerald-400" />
                      2. Cobro en Efectivo
                    </label>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                      {totalAmount > 0 ? ((requiredCash / totalAmount) * 100).toFixed(0) : 0}%
                    </span>
                  </div>
                  <p className="text-[10.5px] text-slate-400 mb-2">
                    Porción asignada para liquidar en efectivo
                  </p>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-400 text-sm font-bold">
                      S/.
                    </span>
                    <input
                      type="number"
                      step="any"
                      value={cashPortion}
                      onChange={(e) => handleCashPortionChange(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      placeholder="0.00"
                      className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg pl-10 pr-3 py-2 text-base font-extrabold text-white outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                </div>
              </div>

              {/* Barra de Distribución y Cobertura Visual */}
              <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-2.5 space-y-2">
                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden flex">
                  <div
                    className="bg-indigo-500 h-full transition-all duration-300"
                    style={{
                      width: `${totalAmount > 0 ? Math.min(100, (digitalNum / totalAmount) * 100) : 0}%`,
                    }}
                  />
                  <div
                    className="bg-emerald-500 h-full transition-all duration-300"
                    style={{
                      width: `${totalAmount > 0 ? Math.min(100, (requiredCash / totalAmount) * 100) : 0}%`,
                    }}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between text-[11px] gap-2">
                  <span className="flex items-center gap-1.5 text-indigo-300 font-semibold">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
                    Digital: {formatCurrency(digitalNum)}
                  </span>
                  <div className="flex items-center gap-1 text-slate-300 font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>
                      Total cubierto: {formatCurrency(digitalNum + requiredCash)} / {formatCurrency(totalAmount)}
                    </span>
                  </div>
                  <span className="flex items-center gap-1.5 text-emerald-300 font-semibold">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                    Efectivo: {formatCurrency(requiredCash)}
                  </span>
                </div>
              </div>

              {/* Recepción de Efectivo en Gaveta y Vuelto */}
              <div className="border-t border-slate-800/80 pt-3 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Banknote className="w-4 h-4 text-amber-400" />
                    Efectivo Recibido en Gaveta (Cliente entrega)
                  </label>
                  <button
                    type="button"
                    onClick={handleSetExactCash}
                    className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 cursor-pointer flex items-center gap-1"
                  >
                    Monto exacto ({formatCurrency(requiredCash)})
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
                    className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 rounded-xl pl-12 pr-4 py-2.5 text-lg font-extrabold text-white outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
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

                {/* Tarjeta de Vuelto Formal */}
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-slate-300 block">Vuelto a entregar:</span>
                    <span className="text-[10.5px] text-slate-400">
                      {cashNum >= requiredCash
                        ? `Recibido ${formatCurrency(cashNum)} - Cobro Efectivo ${formatCurrency(requiredCash)}`
                        : `⚠️ Faltan recibir ${formatCurrency(requiredCash - cashNum)} en efectivo`}
                    </span>
                  </div>
                  <span
                    className={`text-xl sm:text-2xl font-black ${
                      changeAmount > 0 ? 'text-emerald-400' : 'text-slate-400'
                    }`}
                  >
                    {formatCurrency(changeAmount)}
                  </span>
                </div>
              </div>
            </div>
          )}

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
              disabled={isLoading || !isFormValid}
              className={`w-2/3 py-3 rounded-xl font-bold text-sm text-white shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                receiptType === 'NOTA_VENTA'
                  ? 'bg-emerald-600 hover:bg-emerald-500'
                  : receiptType === 'BOLETA'
                    ? 'bg-indigo-600 hover:bg-indigo-500'
                    : 'bg-purple-600 hover:bg-purple-500'
              }`}
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>
                    {receiptType === 'NOTA_VENTA'
                      ? 'Cobrar y Emitir Nota de Venta (Enter)'
                      : receiptType === 'BOLETA'
                        ? 'Cobrar y Emitir Boleta Electrónica'
                        : 'Cobrar y Emitir Factura Electrónica'}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
