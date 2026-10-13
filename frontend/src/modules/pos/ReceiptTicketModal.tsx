import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { formatCurrency, formatPeruDateTime } from '../../lib/utils.js';
import { useConfigStore } from '../../store/useConfigStore.js';
import { Printer, ArrowRight, X, ShieldCheck, Sparkles, FileText } from 'lucide-react';
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
  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm'>('80mm');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);

  const isCreditNote = Boolean(isCreditNoteTicket || saleData?.isCreditNoteTicket);
  const creditNote = saleData?.creditNote;
  const receiptType = saleData?.receiptType || 'NOTA_VENTA';
  const isFiscal = isCreditNote || saleData?.isFiscal || receiptType === 'BOLETA' || receiptType === 'FACTURA';

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
    const dateFormatted = (
      isCreditNote && creditNote?.createdAt
        ? creditNote.createdAt
        : saleData.createdAt || new Date().toISOString()
    ).split('T')[0];
    const customerDoc = (saleData.customerDocument || '').trim();
    const customerDocType = customerDoc.length === 11 ? '6' : customerDoc.length === 8 ? '1' : '-';
    const hashVal =
      (isCreditNote && creditNote?.hash) || saleData.hash || 's1mU14t3dH4shC0d3SuN4tNC==';

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

  const getFullReceiptNumber = () => {
    if (saleData.fullReceiptNumber) return saleData.fullReceiptNumber;
    const series = saleData.series || (receiptType === 'FACTURA' ? 'F001' : receiptType === 'BOLETA' ? 'B001' : 'NV01');
    const corr = String(saleData.correlativeNumber || saleData.saleNumber || 1).padStart(8, '0');
    return `${series}-${corr}`;
  };

  const handlePrint = () => {
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
          <title>${getFullReceiptNumber()}</title>
          <style>
            @page {
              margin: 0mm;
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
              padding: 2mm 1mm 4mm 1mm !important;
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
    }, 250);
  };

  const fullReceiptNumber = getFullReceiptNumber();
  const taxableBase = saleData.taxableBase || Number((saleData.totalAmount / 1.18).toFixed(2));
  const igvAmount = saleData.igvAmount || Number((saleData.totalAmount - taxableBase).toFixed(2));

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
              isCreditNote
                ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                : receiptType === 'NOTA_VENTA'
                  ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                  : receiptType === 'BOLETA'
                    ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
                    : 'bg-purple-500/20 text-purple-400 border-purple-500/30'
            }`}
          >
            {isCreditNote ? (
              <FileText className="w-6 h-6" />
            ) : receiptType === 'NOTA_VENTA' ? (
              <Sparkles className="w-6 h-6" />
            ) : (
              <ShieldCheck className="w-6 h-6" />
            )}
          </div>
          <h3 className="text-lg font-bold text-white">
            {isCreditNote
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
              : `${fullReceiptNumber} • Formato para tiqueteras térmicas de 80mm y 58mm`}
          </p>

          {/* Selector de Ancho de Tiquetera (80mm vs 58mm) */}
          <div className="mt-3 flex items-center justify-center gap-2">
            <span className="text-[11px] text-slate-400">Ancho tiquetera:</span>
            <div className="inline-flex p-1 bg-slate-950 border border-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => setPaperWidth('80mm')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  paperWidth === '80mm'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                80mm (Estándar)
              </button>
              <button
                type="button"
                onClick={() => setPaperWidth('58mm')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  paperWidth === '58mm'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                58mm (Mini)
              </button>
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
            <div className="flex justify-between">
              <span>{receiptType === 'FACTURA' ? 'RAZÓN SOCIAL:' : 'CLIENTE:'}</span>
              <span className="truncate max-w-[170px] font-semibold text-right">
                {saleData.customerName || 'Cliente Varios'}
              </span>
            </div>
            {saleData.customerDocument && (
              <div className="flex justify-between">
                <span>{receiptType === 'FACTURA' ? 'RUC:' : 'DNI/DOC:'}</span>
                <span className="font-bold">{saleData.customerDocument}</span>
              </div>
            )}
            {saleData.customerAddress && (
              <div className="flex justify-between text-[10px]">
                <span>DIRECCIÓN:</span>
                <span className="text-right truncate max-w-[170px]">
                  {saleData.customerAddress}
                </span>
              </div>
            )}
            {saleData.customerEmail && (
              <div className="flex justify-between text-[10px]">
                <span>CORREO:</span>
                <span className="text-right truncate max-w-[170px] font-mono">
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
                const hasMultiple = qty > 1;
                const unitPrice = Number(item.unitPrice);
                const subtotal = Number(item.subtotal);

                return (
                  <tr key={idx} className="py-1">
                    <td className="py-1 align-top font-bold">{qty}</td>
                    <td className="py-1 align-top pr-1.5">
                      <div className="font-semibold text-slate-900 leading-tight">
                        {item.product?.name || item.productName}
                      </div>
                      {hasMultiple && (
                        <div className="text-[9.5px] text-slate-500">
                          {qty} × {formatCurrency(unitPrice)}
                        </div>
                      )}
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

            <div className="flex justify-between text-slate-700 pt-1 text-[10.5px]">
              <span>MÉTODO DE PAGO:</span>
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

            {saleData.paymentMethod === 'CASH' && (
              <div className="pt-1 border-t border-dotted border-slate-300 space-y-0.5 text-[10px] text-slate-600">
                {saleData.cashPaid !== undefined && (
                  <div className="flex justify-between">
                    <span>PAGÓ CON:</span>
                    <span>{formatCurrency(saleData.cashPaid)}</span>
                  </div>
                )}
                {saleData.changeAmount !== undefined && (
                  <div className="flex justify-between font-bold text-slate-900">
                    <span>VUELTO:</span>
                    <span>{formatCurrency(saleData.changeAmount || 0)}</span>
                  </div>
                )}
              </div>
            )}
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
              <div className="text-[9px] text-slate-500 space-y-0.5 pt-1">
                <p className="font-bold">
                  Representación impresa de la {isCreditNote ? 'NOTA DE CRÉDITO ELECTRÓNICA' : 'comprobante de pago electrónico'}
                </p>
                <p>Autorizado mediante resolución de SUNAT</p>
                <p>Consulte su comprobante en www.sunat.gob.pe</p>
              </div>
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
                  Comprobante de control interno sin valor tributario.
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
        <div className="flex gap-3 pt-2 print:hidden">
          <button
            onClick={handlePrint}
            className="w-1/2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold text-xs text-white shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
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
      </div>
    </div>
  );
};
