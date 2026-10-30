import React, { useState, useEffect, useCallback, useRef } from 'react';
import QRCode from 'qrcode';
import {
  escapeHtml,
  formatCurrency,
  formatPeruDateTime,
  getPeruYMD,
  numeroALetras,
  sanitizeExternalUrl,
} from '../../lib/utils.js';
import { useConfigStore } from '../../store/useConfigStore.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import {
  Printer,
  ArrowRight,
  X,
  ShieldCheck,
  Sparkles,
  FileText,
  Zap,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import type { Sale } from '../../types/index.js';

interface ReceiptTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  saleData: Sale | any;
  isCreditNoteTicket?: boolean;
}

export const ReceiptTicketModal: React.FC<ReceiptTicketModalProps> = ({
  isOpen,
  onClose,
  saleData,
  isCreditNoteTicket = false,
}) => {
  const { config } = useConfigStore();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';

  // Preferencia persistida de ancho de papel térmico (80mm o 58mm)
  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pos_thermal_paper_width');
      if (saved === '58mm' || saved === '80mm') return saved;
    }
    return '80mm';
  });

  // Preferencia persistida de impresión automática al abrir
  const [autoPrintEnabled, setAutoPrintEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('pos_thermal_auto_print') === 'true';
    }
    return false;
  });

  // Preferencia persistida de auto-descarga de PDF al emitir comprobante
  const [autoDownloadPdfEnabled, setAutoDownloadPdfEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('pos_auto_download_pdf') === 'true';
    }
    return false;
  });

  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const autoPrintTriggeredRef = useRef(false);
  const autoDownloadTriggeredRef = useRef(false);

  const isCreditNote = Boolean(isCreditNoteTicket || saleData?.isCreditNoteTicket);
  const creditNote = saleData?.creditNote;
  const receiptType = saleData?.receiptType || 'NOTA_VENTA';
  const isFiscal =
    isCreditNote || saleData?.isFiscal || receiptType === 'BOLETA' || receiptType === 'FACTURA';
  const effectiveEmissionStatus: string | null =
    (isCreditNote ? creditNote?.emissionStatus : saleData?.emissionStatus) || null;
  const isEmissionRejected = isFiscal && effectiveEmissionStatus === 'REJECTED';
  const isEmissionPending = isFiscal && effectiveEmissionStatus === 'PENDING';

  const safePdfUrl = sanitizeExternalUrl(
    (isCreditNote ? creditNote?.pdfUrl : null) || saleData?.pdfUrl,
  );
  const safeXmlUrl = sanitizeExternalUrl(
    (isCreditNote ? creditNote?.xmlUrl : null) || saleData?.xmlUrl,
  );
  const safeCdrUrl = sanitizeExternalUrl(
    (isCreditNote ? creditNote?.cdrUrl : null) || saleData?.cdrUrl,
  );

  const handlePaperWidthChange = (width: '80mm' | '58mm') => {
    setPaperWidth(width);
    if (typeof window !== 'undefined') {
      localStorage.setItem('pos_thermal_paper_width', width);
    }
  };

  const handleToggleAutoPrint = () => {
    const nextVal = !autoPrintEnabled;
    setAutoPrintEnabled(nextVal);
    if (typeof window !== 'undefined') {
      localStorage.setItem('pos_thermal_auto_print', String(nextVal));
    }
  };

  const handleToggleAutoDownloadPdf = () => {
    const nextVal = !autoDownloadPdfEnabled;
    setAutoDownloadPdfEnabled(nextVal);
    if (typeof window !== 'undefined') {
      localStorage.setItem('pos_auto_download_pdf', String(nextVal));
    }
  };

  // Generar código QR oficial en DataURL para comprobantes fiscales y notas de crédito
  useEffect(() => {
    let active = true;
    if (!isOpen || !saleData || !isFiscal) {
      return;
    }

    const companyRuc = config.ruc || '10458923011';
    // Tipo de comprobante SUNAT Catálogo 01: 07 = Nota de Crédito, 01 = Factura, 03 = Boleta
    const docTypeCode = isCreditNote ? '07' : receiptType === 'FACTURA' ? '01' : '03';
    const series = isCreditNote
      ? creditNote?.series || (receiptType === 'FACTURA' ? 'FC01' : 'BC01')
      : saleData.series || (receiptType === 'FACTURA' ? 'F001' : 'B001');
    const paddedNum = isCreditNote
      ? String(creditNote?.correlativeNumber || 1).padStart(8, '0')
      : String(saleData.correlativeNumber || saleData.saleNumber || 1).padStart(8, '0');
    const igvFormatted = Number(
      isCreditNote ? (creditNote?.igvAmount ?? saleData.igvAmount ?? 0) : (saleData.igvAmount || 0),
    ).toFixed(2);
    const totalFormatted = Number(
      isCreditNote ? (creditNote?.totalAmount ?? saleData.totalAmount ?? 0) : (saleData.totalAmount || 0),
    ).toFixed(2);
    const dateFormatted = getPeruYMD(
      isCreditNote && creditNote?.createdAt
        ? creditNote.createdAt
        : saleData.createdAt || new Date(),
    );
    const customerDoc = (saleData.customerDocument || '').trim();
    const customerDocType =
      /^\d{11}$/.test(customerDoc) && /^(10|15|16|17|20)/.test(customerDoc)
        ? '6'
        : /^\d{8}$/.test(customerDoc)
          ? '1'
          : customerDoc.length >= 9 && customerDoc.length <= 12
            ? '4'
            : customerDoc
              ? '0'
              : '-';
    const hashVal = (isCreditNote && creditNote?.hash) || saleData.hash || '';

    const rawQrString =
      (isCreditNote && creditNote?.qrString) ||
      saleData.qrString ||
      `${companyRuc}|${docTypeCode}|${series}|${paddedNum}|${igvFormatted}|${totalFormatted}|${dateFormatted}|${customerDocType}|${customerDoc || '-'}|${hashVal}|`;

    QRCode.toDataURL(rawQrString, {
      margin: 1,
      width: 140,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (active) setQrCodeDataUrl(url);
      })
      .catch((err) => console.error('Error generando QR oficial:', err));

    return () => {
      active = false;
    };
  }, [isOpen, saleData, isFiscal, isCreditNote, creditNote, receiptType, config.ruc]);

  const getFullReceiptNumber = useCallback(() => {
    if (!saleData) return '';
    if (saleData.fullReceiptNumber) return saleData.fullReceiptNumber;
    const series =
      saleData.series ||
      (receiptType === 'FACTURA' ? 'F001' : receiptType === 'BOLETA' ? 'B001' : 'NV01');
    const corr = String(saleData.correlativeNumber || saleData.saleNumber || 1).padStart(8, '0');
    return `${series}-${corr}`;
  }, [saleData, receiptType]);

  const handlePrint = useCallback(() => {
    const printElement = document.getElementById('printable-ticket');
    if (!printElement) {
      window.print();
      return;
    }

    let printIframe = document.getElementById('pos-print-iframe') as HTMLIFrameElement;
    if (!printIframe) {
      printIframe = document.createElement('iframe');
      printIframe.id = 'pos-print-iframe';
      printIframe.style.position = 'fixed';
      printIframe.style.right = '0';
      printIframe.style.bottom = '0';
      printIframe.style.width = '0px';
      printIframe.style.height = '0px';
      printIframe.style.border = 'none';
      document.body.appendChild(printIframe);
    }

    const iframeDoc = printIframe.contentDocument || printIframe.contentWindow?.document;
    if (!iframeDoc) {
      window.print();
      return;
    }

    const is58 = paperWidth === '58mm';
    const targetWidth = is58 ? '48mm' : '72mm';
    const baseFontSize = is58 ? '9.5px' : '11px';

    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${escapeHtml(getFullReceiptNumber())}</title>
          <style>
            @page {
              margin: 0mm;
              size: auto;
            }
            @media print {
              html, body {
                margin: 0 !important;
                padding: 0 !important;
                background: #fff !important;
                color: #000 !important;
              }
            }
            * {
              box-sizing: border-box !important;
              margin: 0;
              padding: 0;
            }
            body {
              margin: 0 !important;
              padding: 0 !important;
              font-family: 'Courier New', Courier, monospace, monospace;
              background: #fff !important;
              color: #000 !important;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .ticket-container {
              width: ${targetWidth} !important;
              max-width: ${targetWidth} !important;
              min-width: ${targetWidth} !important;
              margin: 0 auto !important;
              padding: 2mm 1.5mm 10mm 1.5mm !important;
              font-size: ${baseFontSize} !important;
              line-height: 1.25 !important;
              overflow: hidden !important;
            }
            .text-center { text-align: center !important; }
            .text-right { text-align: right !important; }
            .text-left { text-align: left !important; }
            .font-bold { font-weight: bold !important; }
            .font-extrabold { font-weight: 800 !important; }
            .uppercase { text-transform: uppercase !important; }
            .border-b { border-bottom: 1px dashed #000 !important; }
            .border-t { border-top: 1px dashed #000 !important; }
            .pb-3 { padding-bottom: 6px !important; }
            .mb-3 { margin-bottom: 6px !important; }
            .pb-2\\.5 { padding-bottom: 5px !important; }
            .mb-2\\.5 { margin-bottom: 5px !important; }
            .pt-2\\.5 { padding-top: 5px !important; }
            .pt-1 { padding-top: 3px !important; }
            .space-y-1 > div { margin-bottom: 2px !important; }
            .flex { display: flex !important; }
            .justify-between { justify-content: space-between !important; }
            table { width: 100% !important; border-collapse: collapse !important; font-size: inherit !important; margin: 3px 0 !important; }
            th { text-align: left !important; border-bottom: 1px dashed #000 !important; padding: 2px 0 !important; font-size: inherit !important; font-weight: bold !important; }
            td { padding: 2px 0 !important; vertical-align: top !important; }
            .whitespace-nowrap { white-space: nowrap !important; }
            .truncate { overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }
            img { display: block; margin: 0 auto; max-width: 100%; }
          </style>
        </head>
        <body>
          <div class="ticket-container">
            ${printElement.innerHTML}
          </div>
        </body>
      </html>
    `);
    iframeDoc.close();

    setTimeout(() => {
      printIframe.contentWindow?.focus();
      printIframe.contentWindow?.print();
    }, 280);
  }, [paperWidth, getFullReceiptNumber]);

  // Atajo de teclado: Enter para imprimir directamente, Escape para cerrar
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handlePrint();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handlePrint, onClose]);

  // Auto-impresión si la opción está activada
  useEffect(() => {
    if (isOpen && autoPrintEnabled && !autoPrintTriggeredRef.current) {
      autoPrintTriggeredRef.current = true;
      const timer = setTimeout(() => {
        handlePrint();
      }, 400);
      return () => clearTimeout(timer);
    }
    if (!isOpen) {
      autoPrintTriggeredRef.current = false;
    }
  }, [isOpen, autoPrintEnabled, handlePrint]);

  // Auto-descarga de PDF si la opción está activada y el comprobante tiene URL de PDF
  useEffect(() => {
    if (isOpen && autoDownloadPdfEnabled && safePdfUrl && !autoDownloadTriggeredRef.current) {
      autoDownloadTriggeredRef.current = true;
      const timer = setTimeout(() => {
        window.open(safePdfUrl, '_blank', 'noopener,noreferrer');
      }, 500);
      return () => clearTimeout(timer);
    }
    if (!isOpen) {
      autoDownloadTriggeredRef.current = false;
    }
  }, [isOpen, autoDownloadPdfEnabled, safePdfUrl]);

  if (!isOpen || !saleData) return null;

  const getPaymentMethodLabel = (method?: string) => {
    switch (method) {
      case 'CASH':
        return 'EFECTIVO';
      case 'TRANSFER':
        return 'YAPE / PLIN';
      case 'CARD':
        return 'TARJETA';
      case 'MIXED':
        return 'PAGO MIXTO';
      default:
        return method || 'EFECTIVO';
    }
  };

  const fullReceiptNumber = getFullReceiptNumber();
  let taxableBase = Number(saleData.taxableBase || 0);
  let igvAmount = Number(saleData.igvAmount || 0);

  if ((!taxableBase || !igvAmount) && saleData.items && saleData.items.length > 0) {
    let base = 0;
    let igv = 0;
    saleData.items.forEach((item: any) => {
      const sub = Number(item.subtotal ?? item.quantity * item.unitPrice);
      const b = Number((sub / 1.18).toFixed(2));
      base += b;
      igv += Number((sub - b).toFixed(2));
    });
    taxableBase = Number(base.toFixed(2));
    igvAmount = Number(igv.toFixed(2));
  } else if (!taxableBase || !igvAmount) {
    taxableBase = Number((saleData.totalAmount / 1.18).toFixed(2));
    igvAmount = Number((saleData.totalAmount - taxableBase).toFixed(2));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl relative text-slate-100 max-h-[96vh] flex flex-col justify-between">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer print:hidden"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Encabezado modal */}
        <div className="text-center pb-3 border-b border-slate-800 print:hidden">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-2 border ${
              isEmissionRejected
                ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                : isEmissionPending
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                  : isCreditNote
                    ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                    : receiptType === 'NOTA_VENTA'
                      ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                      : receiptType === 'BOLETA'
                        ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
                        : 'bg-purple-500/20 text-purple-400 border-purple-500/30'
            }`}
          >
            {isEmissionRejected ? (
              <AlertTriangle className="w-6 h-6" />
            ) : isEmissionPending ? (
              <Clock className="w-6 h-6" />
            ) : isCreditNote ? (
              <FileText className="w-6 h-6" />
            ) : receiptType === 'NOTA_VENTA' ? (
              <Sparkles className="w-6 h-6" />
            ) : (
              <ShieldCheck className="w-6 h-6" />
            )}
          </div>
          <h3 className="text-lg font-bold text-white">
            {isEmissionRejected
              ? 'Comprobante Observado / Rechazado por PSE'
              : isEmissionPending
                ? 'Comprobante Pendiente de Envío SUNAT'
                : isCreditNote
                  ? '¡Nota de Crédito Electrónica!'
                  : receiptType === 'NOTA_VENTA'
                    ? '¡Nota de Venta Generada!'
                    : receiptType === 'BOLETA'
                      ? '¡Boleta Electrónica Emitida!'
                      : '¡Factura Electrónica Emitida!'}
          </h3>
          <p className="text-xs text-slate-400">
            {isCreditNote
              ? `${creditNote?.fullNumber || 'NC'} • Anulación fiscal de ${fullReceiptNumber}`
              : `${fullReceiptNumber} • Formato para tiqueteras térmicas`}
          </p>

          {/* Banner de error / observación de SUNAT o PSE si fue rechazado o está pendiente */}
          {(isEmissionRejected || isEmissionPending) && saleData?.billingMessage && (
            <div
              className={`mt-2.5 p-2 rounded-xl text-left text-xs border ${
                isEmissionRejected
                  ? 'bg-rose-950/60 border-rose-800 text-rose-300'
                  : 'bg-amber-950/60 border-amber-800 text-amber-300'
              }`}
            >
              <div className="font-bold flex items-center gap-1.5 mb-0.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>
                  {isEmissionRejected ? 'Motivo de Observación / Rechazo PSE:' : 'Estado de Envío SUNAT:'}
                </span>
              </div>
              <p className="font-mono text-[11px] leading-tight break-words">{saleData.billingMessage}</p>
            </div>
          )}

          {/* Selector de Ancho de Tiquetera y Auto-print */}
          <div className="mt-3 flex items-center justify-between gap-2 flex-wrap bg-slate-950/80 p-2 rounded-2xl border border-slate-800/80">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-400 font-semibold uppercase">Rollo:</span>
              <div className="inline-flex p-0.5 bg-slate-900 border border-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => handlePaperWidthChange('80mm')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    paperWidth === '80mm'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  80mm
                </button>
                <button
                  type="button"
                  onClick={() => handlePaperWidthChange('58mm')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    paperWidth === '58mm'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  58mm
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={handleToggleAutoPrint}
                className={`px-2.5 py-1 rounded-xl border text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  autoPrintEnabled
                    ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
                title="Imprimir automáticamente el ticket al abrir"
              >
                <Zap className={`w-3.5 h-3.5 ${autoPrintEnabled ? 'text-amber-400 fill-amber-400' : 'text-slate-500'}`} />
                <span>Auto-imprimir: {autoPrintEnabled ? 'ON' : 'OFF'}</span>
              </button>

              {isFiscal && (
                <button
                  type="button"
                  onClick={handleToggleAutoDownloadPdf}
                  className={`px-2.5 py-1 rounded-xl border text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    autoDownloadPdfEnabled
                      ? 'bg-blue-600/20 text-blue-300 border-blue-500/40'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                  title="Abrir o descargar automáticamente el PDF del comprobante al emitirse"
                >
                  <FileText className={`w-3.5 h-3.5 ${autoDownloadPdfEnabled ? 'text-blue-400' : 'text-slate-500'}`} />
                  <span>Auto-PDF: {autoDownloadPdfEnabled ? 'ON' : 'OFF'}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* VISTA PREVIA DEL TICKET TÉRMICO */}
        <div
          id="printable-ticket"
          className={`my-3 p-4 bg-white text-slate-900 rounded-2xl font-mono text-xs shadow-inner overflow-y-auto max-h-[440px] mx-auto w-full transition-all ${
            paperWidth === '58mm' ? 'max-w-[270px]' : 'max-w-[320px]'
          }`}
        >
          {saleData.isOffline && (
            <div className="text-[10px] bg-amber-100 text-amber-900 border border-dashed border-amber-400 p-1 text-center font-bold mb-2">
              *** MODO SIN CONEXIÓN (OFFLINE) ***
            </div>
          )}

          {/* CABECERA: COMERCIAL RODRIGO */}
          <div className="text-center border-b border-dashed border-slate-400 pb-3 mb-2.5">
            <h4 className="text-base font-extrabold tracking-wider">{config.name}</h4>
            {config.subtitle && (
              <p className="text-[10px] text-slate-600 font-sans uppercase">{config.subtitle}</p>
            )}
            <p className="text-[10px] text-slate-600 mt-1">
              RUC: {config.ruc} {config.phone ? `• Tel: ${config.phone}` : ''}
            </p>
            <p className="text-[9.5px] text-slate-500">{config.address}</p>

            {/* TÍTULO DESTACADO SEGÚN EL TIPO DE COMPROBANTE */}
            <div
              className={`mt-2 py-1 px-1.5 border-t border-b font-bold text-center ${
                isCreditNote ? 'border-rose-400 bg-rose-50 text-rose-900' : 'border-slate-300'
              }`}
            >
              {isCreditNote ? (
                <>
                  <span className="text-[11px] font-extrabold block text-rose-800">
                    NOTA DE CRÉDITO ELECTRÓNICA
                  </span>
                  <span className="text-xs font-extrabold block tracking-wider mt-0.5 font-mono text-rose-950">
                    {creditNote?.fullNumber || `${creditNote?.series || 'BC01'}-${String(creditNote?.correlativeNumber || 1).padStart(8, '0')}`}
                  </span>
                </>
              ) : (
                <>
                  {saleData.isOffline ? (
                    <>
                      <span className="text-[11px] font-extrabold block">
                        TICKET DE VENTA (CONTINGENCIA OFFLINE)
                      </span>
                      {saleData.targetReceiptType && (
                        <span className="text-[9.5px] font-semibold text-slate-700 block mt-0.5">
                          SOLICITUD: {saleData.targetReceiptType === 'FACTURA' ? 'FACTURA ELECTRÓNICA' : 'BOLETA ELECTRÓNICA'}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      {receiptType === 'NOTA_VENTA' && (
                        <span className="text-[11px] font-extrabold block">
                          NOTA DE VENTA - CONTROL INTERNO
                        </span>
                      )}
                      {receiptType === 'BOLETA' && (
                        <span className="text-[11px] font-extrabold block">
                          BOLETA DE VENTA ELECTRÓNICA
                        </span>
                      )}
                      {receiptType === 'FACTURA' && (
                        <span className="text-[11px] font-extrabold block">
                          FACTURA ELECTRÓNICA
                        </span>
                      )}
                    </>
                  )}
                  <span className="text-xs font-extrabold block tracking-wider mt-0.5">
                    {fullReceiptNumber}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* SECCIÓN DOCUMENTO AFECTADO (SOLO EN NOTA DE CRÉDITO) */}
          {isCreditNote && (
            <div className="my-2 p-2 rounded bg-slate-50 border border-slate-300 text-[10px] space-y-1 text-slate-800 text-left">
              <div className="flex justify-between font-bold">
                <span>DOC. AFECTADO:</span>
                <span className="font-mono font-extrabold text-slate-900">{fullReceiptNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>TIPO COMPROBANTE:</span>
                <span>{receiptType === 'FACTURA' ? 'FACTURA ELECTRÓNICA (01)' : 'BOLETA ELECTRÓNICA (03)'}</span>
              </div>
              <div className="flex justify-between">
                <span>FECHA EMISIÓN REF:</span>
                <span>{formatPeruDateTime(saleData.createdAt, true)}</span>
              </div>
              <div className="pt-1 border-t border-slate-200">
                <span className="font-bold text-slate-700">MOTIVO SUNAT (CAT. 09):</span>
                <div className="font-bold text-rose-700 mt-0.5">
                  {creditNote?.reasonDescription || '01 - ANULACIÓN DE LA OPERACIÓN'}
                </div>
              </div>
              {creditNote?.customReason && (
                <div className="text-[9px] text-slate-600 italic">
                  Sustento: {creditNote.customReason}
                </div>
              )}
            </div>
          )}

          {/* INFORMACIÓN DE LA OPERACIÓN Y CLIENTE */}
          <div className="text-[10.5px] space-y-0.5 border-b border-dashed border-slate-400 pb-2 mb-2">
            <div className="flex justify-between">
              <span>FECHA:</span>
              <span>{formatPeruDateTime(saleData.createdAt, true)}</span>
            </div>
            <div className="flex justify-between">
              <span>CAJA:</span>
              <span className="font-bold">
                {saleData.cashShift?.cashRegister?.name || saleData.cashRegister || 'Caja 1'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>CAJERO:</span>
              <span>{saleData.user?.name || saleData.cashier || 'Cajero de Turno'}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="shrink-0">{receiptType === 'FACTURA' ? 'RAZÓN SOCIAL:' : 'CLIENTE:'}</span>
              <span className="break-words max-w-[195px] font-semibold text-right">
                {saleData.customerName || (receiptType === 'FACTURA' ? '-' : 'Clientes Varios')}
              </span>
            </div>
            {saleData.customerDocument && (
              <div className="flex justify-between">
                <span>{receiptType === 'FACTURA' ? 'RUC:' : 'DNI/DOC:'}</span>
                <span className="font-bold">{saleData.customerDocument}</span>
              </div>
            )}
            {saleData.voidedReason?.startsWith('CANJE_TICKET:') && (
              <div className="flex justify-between font-bold text-amber-900 bg-amber-50 px-1 py-0.5 rounded border border-amber-200 mt-1">
                <span>CANJE DE TICKET:</span>
                <span className="font-mono font-black">{saleData.voidedReason.replace('CANJE_TICKET:', '')}</span>
              </div>
            )}
            {saleData.customerAddress && (
              <div className="flex justify-between gap-2 text-[10px]">
                <span className="shrink-0">DIRECCIÓN:</span>
                <span className="text-right break-words max-w-[195px]">
                  {saleData.customerAddress}
                </span>
              </div>
            )}
            {saleData.customerEmail && (
              <div className="flex justify-between gap-2 text-[10px]">
                <span className="shrink-0">CORREO:</span>
                <span className="text-right break-all max-w-[195px] font-mono">
                  {saleData.customerEmail}
                </span>
              </div>
            )}
          </div>

          {/* TABLA DE DETALLE DE PRODUCTOS */}
          <table className="w-full text-[10.5px] mb-2.5">
            <thead>
              <tr className="border-b border-slate-400 text-left">
                <th className="py-1">CANT</th>
                <th className="py-1">DESCRIPCIÓN</th>
                <th className="py-1 text-right">TOTAL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {saleData.items?.map((item: any, idx: number) => {
                const qty = Number(item.quantity);
                const unitPrice = Number(item.unitPrice);
                const subtotal = Number(item.subtotal);
                const rawUnit = item.product?.unitType || item.unitType || 'NIU';

                return (
                  <tr key={idx} className="py-1">
                    <td className="py-1 align-top font-bold">{qty}</td>
                    <td className="py-1 align-top pr-1.5">
                      <div className="font-semibold text-slate-900 leading-tight">
                        {item.product?.name || item.productName}
                      </div>
                      <div className="text-[9.5px] text-slate-500">
                        {qty} {rawUnit} × {formatCurrency(unitPrice)}
                      </div>
                    </td>
                    <td className="py-1 align-top text-right font-bold whitespace-nowrap">
                      {formatCurrency(subtotal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* TOTALES Y DESGLOSE FINANCIERO */}
          <div className="border-t border-dashed border-slate-400 pt-2 space-y-1 text-[11px]">
            {/* Si es fiscal (Boleta o Factura o Nota de Crédito), mostrar desglose formal de Op. Gravada e IGV */}
            {isFiscal && (
              <div className="space-y-0.5 pb-1 border-b border-dotted border-slate-300 text-[10px] text-slate-700">
                <div className="flex justify-between">
                  <span>{isCreditNote ? 'OP. GRAVADA DEVUELTA:' : 'OP. GRAVADA:'}</span>
                  <span>{formatCurrency(taxableBase)}</span>
                </div>
                <div className="flex justify-between">
                  <span>I.G.V. (18%):</span>
                  <span>{formatCurrency(igvAmount)}</span>
                </div>
              </div>
            )}

            <div className="flex justify-between font-extrabold text-sm pt-0.5">
              <span>{isCreditNote ? 'TOTAL ANULADO:' : 'TOTAL A PAGAR:'}</span>
              <span className={isCreditNote ? 'text-rose-600' : ''}>
                {formatCurrency(isCreditNote && creditNote?.totalAmount ? creditNote.totalAmount : saleData.totalAmount)}
              </span>
            </div>

            {/* 🛡️ REGLA SUNAT (Cat. 52): LEYENDA DEL MONTO EN LETRAS */}
            <div className="text-[9.5px] font-bold text-slate-800 border-t border-dotted border-slate-300 pt-1 leading-tight uppercase">
              {numeroALetras(isCreditNote && creditNote?.totalAmount ? creditNote.totalAmount : saleData.totalAmount)}
            </div>

            {/* 🛡️ REGLA SUNAT: CONDICIÓN DE PAGO (CONTADO) */}
            <div className="flex justify-between text-slate-700 pt-1 text-[10.5px]">
              <span>CONDICIÓN DE PAGO:</span>
              <span className="font-extrabold uppercase text-slate-900">
                CONTADO
              </span>
            </div>

            <div className="flex justify-between text-slate-700 text-[10.5px]">
              <span>MEDIO DE PAGO:</span>
              <span className="font-bold uppercase text-slate-900">
                {getPaymentMethodLabel(saleData.paymentMethod)}
              </span>
            </div>

            {saleData.paymentMethod === 'MIXED' && (
              <div className="pl-2 space-y-0.5 text-[10px] text-slate-600">
                <div className="flex justify-between">
                  <span>• Efectivo:</span>
                  <span>{formatCurrency(saleData.cashPaid || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>• Digital (Yape/Plin/Tarj):</span>
                  <span>{formatCurrency(saleData.digitalPaid || 0)}</span>
                </div>
              </div>
            )}

            {/* Si pagó con efectivo (sea CASH o MIXED), mostrar siempre el monto entregado y el vuelto exacto */}
            {(() => {
              const cashReceived =
                saleData.cashPaid !== undefined
                  ? Number(saleData.cashPaid)
                  : saleData.amountReceived !== undefined
                    ? Number(saleData.amountReceived)
                    : 0;

              const changeGiven =
                saleData.changeAmount !== undefined
                  ? Number(saleData.changeAmount)
                  : saleData.changeGiven !== undefined
                    ? Number(saleData.changeGiven)
                    : 0;

              if (saleData.paymentMethod === 'CASH' || cashReceived > 0) {
                const digitalAmt = Number(saleData.digitalPaid || 0);
                const totalSaleAmt = Number(
                  isCreditNote && creditNote?.totalAmount ? creditNote.totalAmount : saleData.totalAmount || 0,
                );
                const netPaid = (cashReceived + digitalAmt) - changeGiven;
                const bcrpRoundingDiff = Number((netPaid - totalSaleAmt).toFixed(2));

                return (
                  <div className="pt-1 border-t border-dotted border-slate-300 space-y-0.5 text-[10px] text-slate-600">
                    {cashReceived > 0 && (
                      <div className="flex justify-between">
                        <span>PAGÓ CON (EFECTIVO):</span>
                        <span className="font-semibold text-slate-900">{formatCurrency(cashReceived)}</span>
                      </div>
                    )}
                    {changeGiven > 0 && (
                      <div className="flex justify-between font-bold text-slate-900">
                        <span>VUELTO:</span>
                        <span>{formatCurrency(changeGiven)}</span>
                      </div>
                    )}
                    {bcrpRoundingDiff < 0 && Math.abs(bcrpRoundingDiff) <= 0.10 && (
                      <div className="flex justify-between text-slate-700 italic">
                        <span>REDONDEO BCRP (LEY 29571):</span>
                        <span className="font-semibold">{formatCurrency(bcrpRoundingDiff)}</span>
                      </div>
                    )}
                  </div>
                );
              }
              return null;
            })()}
          </div>

          {/* SECCIÓN FISCAL O CONTROL INTERNO */}
          {isFiscal ? (
            <div className="text-center border-t border-dashed border-slate-400 pt-3 mt-3 space-y-1.5">
              {/* Código QR Oficial de SUNAT */}
              {qrCodeDataUrl ? (
                <div className="flex flex-col items-center justify-center my-1">
                  <img
                    src={qrCodeDataUrl}
                    alt="Código QR SUNAT"
                    className="w-28 h-28 mx-auto"
                    style={{ width: '110px', height: '110px' }}
                  />
                </div>
              ) : (
                <div className="w-24 h-24 mx-auto border border-dashed border-slate-400 flex items-center justify-center text-[9px] text-slate-500">
                  [CÓDIGO QR SUNAT]
                </div>
              )}

              {/* Código Hash Impreso al pie del QR */}
              {((isCreditNote && creditNote?.hash) || saleData.hash) && (
                <div className="text-[9px] font-mono text-slate-600 break-all px-1">
                  <span>Hash: </span>
                  <span className="font-bold">{(isCreditNote && creditNote?.hash) || saleData.hash}</span>
                </div>
              )}

              {/* Leyenda Legal Oficial */}
              {isEmissionRejected ? (
                <div className="p-2 rounded bg-rose-50 border border-rose-300 text-[9px] text-rose-800 space-y-0.5">
                  <p className="font-extrabold uppercase">COMPROBANTE RECHAZADO / OBSERVADO</p>
                  {saleData.billingMessage && (
                    <p className="font-mono text-[8.5px] leading-tight break-words">{saleData.billingMessage}</p>
                  )}
                  <p>Requiere corrección o reenvío por Administración para validez tributaria ante SUNAT.</p>
                </div>
              ) : (
                <div className="text-[9px] text-slate-500 space-y-0.5 pt-1">
                  <p className="font-bold">
                    Representación impresa de la{' '}
                    {isCreditNote
                      ? 'NOTA DE CRÉDITO ELECTRÓNICA'
                      : receiptType === 'FACTURA'
                        ? 'FACTURA ELECTRÓNICA'
                        : 'BOLETA DE VENTA ELECTRÓNICA'}
                  </p>
                  <p>
                    {isEmissionPending
                      ? 'En cola de transmisión electrónica a SUNAT (PSE)'
                      : 'Autorizado mediante resolución de SUNAT'}
                  </p>
                  <p>Consulte su comprobante en www.sunat.gob.pe</p>
                </div>
              )}
            </div>
          ) : (
            /* PLANTILLA DE NOTA DE VENTA: Sin QR ni leyendas de SUNAT */
            <div className="text-center border-t border-dashed border-slate-400 pt-3 mt-3 space-y-1.5">
              {/* Código de barras interno de control para cambios/devoluciones */}
              <div className="my-1.5 px-2 py-1 bg-slate-50 rounded border border-slate-200">
                <div className="tracking-[4px] font-extrabold text-[12px] text-slate-800 font-mono">
                  || | |||| | |||||| | ||| ||| |
                </div>
                <div className="text-[9px] text-slate-500 font-mono tracking-wider mt-0.5">
                  ID: {saleData.id ? String(saleData.id).substring(0, 13).toUpperCase() : fullReceiptNumber}
                </div>
              </div>

              <div className="text-[9.5px] text-slate-500">
                <p className="font-semibold text-slate-700">
                  {saleData.isOffline && saleData.targetReceiptType && saleData.targetReceiptType !== 'NOTA_VENTA'
                    ? `Ticket provisional emitido en contingencia offline. Su ${saleData.targetReceiptType === 'FACTURA' ? 'Factura' : 'Boleta'} electrónica oficial será regularizada y transmitida a SUNAT automáticamente al reconectar.`
                    : 'Comprobante de control interno sin valor tributario.'}
                </p>
                <p className="mt-0.5">
                  Para cambios o devoluciones es indispensable presentar este ticket.
                </p>
              </div>
            </div>
          )}

          {/* Pie de ticket configurado */}
          <div className="text-center text-[9.5px] text-slate-600 border-t border-dashed border-slate-400 pt-2.5 mt-2.5">
            <p className="font-bold whitespace-pre-line">{config.footerText}</p>
          </div>
        </div>

        {/* Acciones de impresión y cierre */}
        <div className="pt-2 print:hidden space-y-2">
          <div className="flex gap-3">
            <button
              onClick={handlePrint}
              className="w-1/2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold text-xs text-white shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir ({paperWidth})</span>
            </button>

            <button
              onClick={onClose}
              className="w-1/2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 font-semibold text-xs text-white border border-slate-700 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <span>Nueva Venta</span>
              <ArrowRight className="w-4 h-4 text-slate-300" />
            </button>
          </div>
          {/* Descargas Fiscales:
              - Si es ADMIN: Puede ver y descargar PDF, XML (UBL 2.1) y CDR SUNAT
              - Si es CAJERO: Solo ve "Descargar PDF" para no saturar la pantalla con archivos técnicos
          */}
          {(safePdfUrl || (isAdmin && (safeXmlUrl || safeCdrUrl))) && (
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center gap-2 flex-wrap text-[11px]">
              <span className="text-slate-400 font-semibold text-[10px] uppercase">
                {isAdmin ? 'Descargas SUNAT (Admin):' : 'Comprobante:'}
              </span>
              {safePdfUrl && (
                <a
                  href={safePdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 font-semibold text-xs transition-all flex items-center gap-1.5"
                  title="Descargar representación gráfica en PDF"
                >
                  <FileText className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Descargar PDF</span>
                </a>
              )}
              {isAdmin && safeXmlUrl && (
                <a
                  href={safeXmlUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 font-mono text-xs transition-all"
                  title="Archivo XML firmado UBL 2.1 oficial para SUNAT (Solo Administrador)"
                >
                  XML (UBL 2.1)
                </a>
              )}
              {isAdmin && safeCdrUrl && (
                <a
                  href={safeCdrUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 font-mono text-xs transition-all"
                  title="Constancia de Recepción CDR de SUNAT (Solo Administrador)"
                >
                  CDR SUNAT
                </a>
              )}
            </div>
          )}

          <p className="text-[10px] text-slate-500 text-center">
            Atajo rápido: Pulsa <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">Enter</kbd> para imprimir o <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">Esc</kbd> para salir.
          </p>
        </div>
      </div>
    </div>
  );
};
