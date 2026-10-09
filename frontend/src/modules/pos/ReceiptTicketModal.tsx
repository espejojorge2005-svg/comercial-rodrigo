import React from 'react';
import { formatCurrency } from '../../lib/utils.js';
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
  if (!isOpen || !saleData) return null;

  const handlePrint = () => {
    window.print();
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
          <p className="text-xs text-slate-400">Comprobante generado y stock actualizado</p>
        </div>

        {/* VISTA PREVIA DEL TICKET TÉRMICO (58mm / 80mm) */}
        <div
          id="printable-ticket"
          className="my-4 p-5 bg-white text-slate-900 rounded-2xl font-mono text-xs shadow-inner overflow-y-auto max-h-[420px] print:max-h-none print:shadow-none print:p-0 print:m-0 print:rounded-none"
        >
          {/* Cabecera del ticket */}
          <div className="text-center border-b border-dashed border-slate-400 pb-3 mb-3">
            <h4 className="text-base font-extrabold tracking-wider">COMERCIAL RODRIGO</h4>
            <p className="text-[11px] text-slate-600 font-sans">VENTA POR MAYOR Y MENOR</p>
            <p className="text-[10px] text-slate-500 mt-1">
              RUC: 10458923011 • Tel: (01) 987-654-321
            </p>
            <p className="text-[10px] text-slate-500">Av. Principal 1234, Lima</p>
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
              {saleData.items?.map((item: any, idx: number) => (
                <tr key={idx} className="py-1">
                  <td className="py-1 align-top font-bold">{item.quantity}</td>
                  <td className="py-1 align-top pr-2">
                    <div>{item.product?.name || item.productName}</div>
                    <div className="text-[9px] text-slate-500">
                      @{formatCurrency(item.unitPrice)}
                    </div>
                  </td>
                  <td className="py-1 align-top text-right font-bold">
                    {formatCurrency(item.subtotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totales */}
          <div className="border-t border-dashed border-slate-400 pt-2.5 space-y-1 text-[11px]">
            <div className="flex justify-between font-bold text-sm">
              <span>TOTAL A PAGAR:</span>
              <span>{formatCurrency(saleData.totalAmount)}</span>
            </div>

            <div className="flex justify-between text-slate-600 pt-1">
              <span>MÉTODO DE PAGO:</span>
              <span className="font-semibold uppercase">{saleData.paymentMethod}</span>
            </div>

            {saleData.cashPaid > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>EFECTIVO RECIBIDO:</span>
                <span>{formatCurrency(saleData.cashPaid)}</span>
              </div>
            )}

            {saleData.digitalPaid > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>PAGO DIGITAL:</span>
                <span>{formatCurrency(saleData.digitalPaid)}</span>
              </div>
            )}

            {saleData.changeAmount > 0 && (
              <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-1">
                <span>VUELTO ENTREGADO:</span>
                <span>{formatCurrency(saleData.changeAmount)}</span>
              </div>
            )}
          </div>

          {/* Pie de ticket */}
          <div className="text-center text-[10px] text-slate-500 border-t border-dashed border-slate-400 pt-3 mt-3">
            <p className="font-bold">¡GRACIAS POR SU COMPRA!</p>
            <p>Comercial Rodrigo siempre a su servicio</p>
          </div>
        </div>

        {/* Acciones de impresión y cierre */}
        <div className="flex gap-3 pt-2 print:hidden">
          <button
            onClick={handlePrint}
            className="w-1/2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 font-semibold text-xs text-white border border-slate-700 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <Printer className="w-4 h-4 text-indigo-400" />
            <span>Imprimir Ticket</span>
          </button>

          <button
            onClick={onClose}
            className="w-1/2 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold text-xs text-white shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <span>Nueva Venta</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
