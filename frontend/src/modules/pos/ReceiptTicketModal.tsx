import React from 'react';
import { formatCurrency } from '../../lib/utils.js';
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

    const printWindow = window.open('', '_blank', 'width=380,height=650');
    if (!printWindow) {
      // Fallback a impresión nativa si el navegador bloquea popups
      window.print();
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Ticket #${String(saleData.saleNumber || '0001').padStart(6, '0')}</title>
          <style>
            @page {
              size: 80mm auto;
              margin: 0;
            }
            @media print {
              html, body {
                width: 80mm;
                margin: 0;
                padding: 0;
              }
            }
            body {
              width: 74mm;
              margin: 0 auto;
              padding: 4mm 2mm 16mm 2mm;
              font-family: 'Courier New', Courier, monospace;
              font-size: 11px;
              line-height: 1.25;
              color: #000;
              background: #fff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .text-left { text-align: left; }
            .font-bold { font-weight: bold; }
            .font-extrabold { font-weight: 800; }
            .uppercase { text-transform: uppercase; }
            .border-b { border-bottom: 1px dashed #000; }
            .border-t { border-top: 1px dashed #000; }
            .pb-2 { padding-bottom: 6px; }
            .pt-2 { padding-top: 6px; }
            .mb-2 { margin-bottom: 6px; }
            .mt-2 { margin-top: 6px; }
            .space-y-1 > div { margin-bottom: 2px; }
            .flex { display: flex; }
            .justify-between { justify-content: space-between; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th { text-align: left; border-bottom: 1px dashed #000; padding: 3px 0; font-size: 10px; }
            td { padding: 3px 0; vertical-align: top; }
            .cut-feed { height: 18mm; }
          </style>
        </head>
        <body>
          ${printElement.innerHTML}
          <div class="cut-feed"></div>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative text-slate-100 max-h-[95vh] flex flex-col justify-between">
        <button
          onClick={onClose}
          className="absolute right-5 top-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer print:hidden"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Encabezado modal */}
        <div className="text-center pb-3 border-b border-slate-800 print:hidden">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto mb-2">
            <CheckCircle className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">¡Venta Realizada con Éxito!</h3>
          <p className="text-xs text-slate-400">Comprobante listo para imprimir en tiquetera térmica</p>
        </div>

        {/* VISTA PREVIA DEL TICKET TÉRMICO (58mm / 80mm) */}
        <div
          id="printable-ticket"
          className="my-4 p-5 bg-white text-slate-900 rounded-2xl font-mono text-xs shadow-inner overflow-y-auto max-h-[420px] print:max-h-none print:shadow-none print:p-0 print:m-0 print:rounded-none"
        >
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
                {String(saleData.saleNumber || '0001').padStart(6, '0')}
              </span>
            </div>
            <div className="flex justify-between">
              <span>FECHA:</span>
              <span>
                {new Date(saleData.createdAt || Date.now()).toLocaleDateString()}{' '}
                {new Date(saleData.createdAt || Date.now()).toLocaleTimeString()}
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
              <div className="text-[10px] text-slate-600 pl-2 space-y-0.5">
                <div className="flex justify-between">
                  <span>• Efectivo:</span>
                  <span>{formatCurrency(saleData.cashPaid)}</span>
                </div>
                <div className="flex justify-between">
                  <span>• Digital:</span>
                  <span>{formatCurrency(saleData.digitalPaid)}</span>
                </div>
              </div>
            )}

            {saleData.paymentMethod === 'CASH' && Number(saleData.cashPaid) > Number(saleData.totalAmount) && (
              <div className="flex justify-between text-slate-600">
                <span>EFECTIVO RECIBIDO:</span>
                <span>{formatCurrency(saleData.cashPaid)}</span>
              </div>
            )}

            {Number(saleData.changeAmount) > 0 && (
              <div className="flex justify-between font-bold text-slate-900 border-t border-dashed border-slate-300 pt-1">
                <span>VUELTO ENTREGADO:</span>
                <span>{formatCurrency(saleData.changeAmount)}</span>
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
            className="w-1/2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 font-semibold text-xs text-white border border-slate-700 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <Printer className="w-4 h-4 text-slate-300" />
            <span>Imprimir Ticket</span>
          </button>

          <button
            onClick={onClose}
            className="w-1/2 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 font-bold text-xs text-white shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <span>Nueva Venta</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
