import React, { useState } from 'react';
import { formatCurrency, formatPeruDateTime } from '../../lib/utils.js';
import { useConfigStore } from '../../store/useConfigStore.js';
import { Printer, CheckCircle, ArrowRight, X } from 'lucide-react';

interface ReceiptTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  saleData: any;
}

export const ReceiptTicketModal: React.FC<ReceiptTicketModalProps> = ({
  isOpen,
  onClose,
  saleData,
}) => {
  const { config } = useConfigStore();
  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm'>('80mm');

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
          <title>Ticket #${String(saleData.saleNumber || '0001').padStart(6, '0')}</title>
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
            .pb-2\.5 { padding-bottom: 5px !important; }
            .mb-2\.5 { margin-bottom: 5px !important; }
            .pt-2\.5 { padding-top: 5px !important; }
            .pt-1 { padding-top: 3px !important; }
            .space-y-1 > div { margin-bottom: 2px !important; }
            .flex { display: flex !important; }
            .justify-between { justify-content: space-between !important; }
            table { width: 100% !important; border-collapse: collapse !important; font-size: inherit !important; margin: 3px 0 !important; }
            th { text-align: left !important; border-bottom: 1px dashed #000 !important; padding: 2px 0 !important; font-size: inherit !important; font-weight: bold !important; }
            td { padding: 2px 0 !important; vertical-align: top !important; }
            .whitespace-nowrap { white-space: nowrap !important; }
            .truncate { overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl relative text-slate-100 max-h-[95vh] flex flex-col justify-between">
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
              saleData.isOffline
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
            }`}
          >
            <CheckCircle className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">
            {saleData.isOffline ? '¡Venta Guardada Localmente (Offline)!' : '¡Venta Realizada con Éxito!'}
          </h3>
          <p className="text-xs text-slate-400">
            Formato optimizado para tiqueteras térmicas de 80mm / 58mm
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
          className={`my-3 p-4 bg-white text-slate-900 rounded-2xl font-mono text-xs shadow-inner overflow-y-auto max-h-[420px] mx-auto w-full transition-all ${
            paperWidth === '58mm' ? 'max-w-[270px]' : 'max-w-[320px]'
          }`}
        >
          {saleData.isOffline && (
            <div className="text-[10px] bg-amber-100 text-amber-900 border border-dashed border-amber-400 p-1 text-center font-bold mb-2">
              *** MODO SIN CONEXIÓN (OFFLINE) ***
            </div>
          )}

          {/* Cabecera del ticket */}
          <div className="text-center border-b border-dashed border-slate-400 pb-3 mb-3">
            <h4 className="text-base font-extrabold tracking-wider">{config.name}</h4>
            {config.subtitle && (
              <p className="text-[11px] text-slate-600 font-sans">{config.subtitle}</p>
            )}
            <p className="text-[10px] text-slate-500 mt-1">
              RUC: {config.ruc} {config.phone ? `• Tel: ${config.phone}` : ''}
            </p>
            <p className="text-[10px] text-slate-500">{config.address}</p>
          </div>

          {/* Información de la venta */}
          <div className="text-[11px] space-y-1 border-b border-dashed border-slate-400 pb-2.5 mb-2.5">
            <div className="flex justify-between">
              <span>TICKET #:</span>
              <span className="font-bold">
                {typeof saleData.saleNumber === 'number'
                  ? String(saleData.saleNumber).padStart(6, '0')
                  : String(saleData.saleNumber || '0001')}
              </span>
            </div>
            <div className="flex justify-between">
              <span>FECHA:</span>
              <span>
                {formatPeruDateTime(saleData.createdAt || Date.now(), true)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>CAJA:</span>
              <span className="font-bold">{saleData.cashShift?.cashRegister?.name || 'Caja 1'}</span>
            </div>
            <div className="flex justify-between">
              <span>CAJERO:</span>
              <span>{saleData.user?.name || 'Cajero'}</span>
            </div>
            <div className="flex justify-between">
              <span>CLIENTE:</span>
              <span className="truncate max-w-[180px]">{saleData.customerName || 'Cliente Varios'}</span>
            </div>
            {saleData.customerDocument && (
              <div className="flex justify-between">
                <span>DOC/DNI/RUC:</span>
                <span>{saleData.customerDocument}</span>
              </div>
            )}
          </div>

          {/* Detalle de Artículos */}
          <table className="w-full text-[11px] mb-3">
            <thead>
              <tr className="border-b border-slate-300 text-left">
                <th className="py-1">CANT</th>
                <th className="py-1">DESCRIPCIÓN</th>
                <th className="py-1 text-right">TOTAL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {saleData.items?.map((item: any, idx: number) => {
                const qty = Number(item.quantity);
                const hasMultiple = qty > 1;

                return (
                  <tr key={idx} className="py-1">
                    <td className="py-1 align-top font-bold">{item.quantity}</td>
                    <td className="py-1 align-top pr-2">
                      <div className="font-semibold text-slate-900">
                        {item.product?.name || item.productName}
                      </div>
                      {hasMultiple && (
                        <div className="text-[10px] text-slate-500">
                          {item.quantity} × {formatCurrency(item.unitPrice)}
                        </div>
                      )}
                    </td>
                    <td className="py-1 align-top text-right font-bold whitespace-nowrap">
                      {formatCurrency(item.subtotal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Totales */}
          <div className="border-t border-dashed border-slate-400 pt-2.5 space-y-1 text-[11px]">
            <div className="flex justify-between font-bold text-sm">
              <span>TOTAL A PAGAR:</span>
              <span>{formatCurrency(saleData.totalAmount)}</span>
            </div>

            <div className="flex justify-between text-slate-700 pt-1">
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

            {saleData.paymentMethod === 'CASH' && saleData.amountReceived && (
              <div className="pt-1 border-t border-dotted border-slate-300 space-y-0.5 text-[10px] text-slate-600">
                <div className="flex justify-between">
                  <span>PAGÓ CON:</span>
                  <span>{formatCurrency(saleData.amountReceived)}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-900">
                  <span>VUELTO:</span>
                  <span>{formatCurrency(saleData.changeGiven || 0)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Pie de ticket */}
          <div className="text-center text-[10px] text-slate-500 border-t border-dashed border-slate-400 pt-3 mt-3">
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
            <span>Imprimir Ticket ({paperWidth})</span>
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
