import React from 'react';
import { formatCurrency, formatPeruDate, formatPeruTime } from '../../lib/utils.js';
import { useConfigStore } from '../../store/useConfigStore.js';
import { Printer, X } from 'lucide-react';

export interface ShiftReceiptData {
  shiftId?: string;
  cajaName: string;
  cajaIdentifier?: string;
  cashierName: string;
  openedAt: string | Date;
  closedAt?: string | Date | null;
  initialBalance: number;
  actualBalance: number;
  expectedBalance?: number | null;
  difference?: number | null;
  isBlindAudit?: boolean;
  salesCount?: number;
  cashFromSales?: number;
  digitalFromSales?: number;
  yapePlinSales?: number;
  cardSales?: number;
  pureCashSales?: number;
  mixedSales?: number;
  totalSales?: number;
  incomeMovements?: number;
  expenseMovements?: number;
  notes?: string | null;
}

interface ShiftReceiptTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  shiftData: ShiftReceiptData | null;
}

export const ShiftReceiptTicketModal: React.FC<ShiftReceiptTicketModalProps> = ({
  isOpen,
  onClose,
  shiftData,
}) => {
  const { config } = useConfigStore();

  if (!isOpen || !shiftData) return null;

  const isBlind = shiftData.isBlindAudit !== false && shiftData.expectedBalance === undefined;

  const handlePrint = () => {
    const printElement = document.getElementById('printable-shift-ticket');
    if (!printElement) {
      window.print();
      return;
    }

    const printWindow = window.open('', '_blank', 'width=380,height=680');
    if (!printWindow) {
      window.print();
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Corte_Caja_${shiftData.cajaIdentifier || 'Caja'}_${formatPeruDate(shiftData.closedAt || new Date()).replace(/\//g, '-')}</title>
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
            .border-double-b { border-bottom: 2px solid #000; }
            .border-box { border: 1px solid #000; padding: 4px; }
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

  const diff = shiftData.difference !== null && shiftData.difference !== undefined ? shiftData.difference : null;
  const isExact = diff !== null && Math.abs(diff) < 0.05;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative text-slate-100 max-h-[95vh] flex flex-col justify-between">
        <button
          onClick={onClose}
          className="absolute right-5 top-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer print:hidden"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Modal */}
        <div className="text-center pb-3 border-b border-slate-800 print:hidden">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto mb-2">
            <Printer className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">
            {isBlind ? 'Ticket de Entrega de Turno (Corte de Caja)' : 'Ticket de Auditoría de Cierre (Corte Z)'}
          </h3>
          <p className="text-xs text-slate-400">
            Formato optimizado para tiquetera térmica de 80mm / 58mm
          </p>
        </div>

        {/* VISTA PREVIA DEL TICKET TÉRMICO */}
        <div
          id="printable-shift-ticket"
          className="my-4 p-5 bg-white text-slate-900 rounded-2xl font-mono text-xs shadow-inner overflow-y-auto max-h-[460px] print:max-h-none print:shadow-none print:p-0 print:m-0 print:rounded-none"
        >
          {/* Membrete Negocio */}
          <div className="text-center border-b border-dashed border-slate-400 pb-3 mb-3">
            <h4 className="text-base font-extrabold tracking-wider uppercase">{config.name}</h4>
            {config.subtitle && (
              <p className="text-[11px] text-slate-600 font-sans">{config.subtitle}</p>
            )}
            <p className="text-[10px] text-slate-600 mt-1">
              RUC: {config.ruc} {config.phone ? `• TEL: ${config.phone}` : ''}
            </p>
            <p className="text-[10px] text-slate-600">{config.address}</p>

            <div className="mt-2.5 pt-2 border-t border-dashed border-slate-400">
              <span className="font-extrabold text-[12px] block tracking-wide uppercase">
                {isBlind ? '*** CORTE DE CAJA - ENTREGA ***' : '*** CORTE Z - AUDITORÍA GENERAL ***'}
              </span>
              <span className="text-[10px] text-slate-500 font-sans block">
                {isBlind ? 'Comprobante Oficial de Arqueo Físico' : 'Reporte Consolidado de Cierre Fiscal'}
              </span>
            </div>
          </div>

          {/* Información del Turno */}
          <div className="text-[11px] space-y-1 border-b border-dashed border-slate-400 pb-2.5 mb-2.5">
            <div className="flex justify-between">
              <span>CAJA:</span>
              <span className="font-bold">
                {shiftData.cajaName} {shiftData.cajaIdentifier ? `(${shiftData.cajaIdentifier})` : ''}
              </span>
            </div>
            <div className="flex justify-between">
              <span>CAJERO(A):</span>
              <span className="font-bold">{shiftData.cashierName}</span>
            </div>
            <div className="flex justify-between">
              <span>APERTURA:</span>
              <span>
                {formatPeruTime(shiftData.openedAt)} ({formatPeruDate(shiftData.openedAt)})
              </span>
            </div>
            <div className="flex justify-between">
              <span>CIERRE:</span>
              <span>
                {shiftData.closedAt ? (
                  `${formatPeruTime(shiftData.closedAt)} (${formatPeruDate(shiftData.closedAt)})`
                ) : (
                  'EN CURSO'
                )}
              </span>
            </div>
            {shiftData.salesCount !== undefined && (
              <div className="flex justify-between">
                <span>TICKETS EMITIDOS:</span>
                <span className="font-bold">{shiftData.salesCount} ventas</span>
              </div>
            )}
          </div>

          {/* DESGLOSE SEGÚN MODO (Cajero Arqueo Ciego vs Admin Auditoría Z) */}
          {isBlind ? (
            /* Modo Cajero */
            <div className="space-y-2 mb-3">
              <div className="flex justify-between text-[11px]">
                <span>FONDO INICIAL (BASE):</span>
                <span className="font-semibold">{formatCurrency(shiftData.initialBalance)}</span>
              </div>

              {/* Recuadro Destacado con el Dinero Físico Entregado */}
              <div className="p-2.5 border-2 border-black rounded text-center my-2.5 bg-slate-50">
                <span className="text-[10px] block font-bold text-slate-700 tracking-wider">
                  TOTAL EFECTIVO FÍSICO ENTREGADO EN GAVETA
                </span>
                <span className="text-base font-extrabold block mt-0.5 tracking-tight">
                  {formatCurrency(shiftData.actualBalance)}
                </span>
                <span className="text-[9px] text-slate-600 font-sans block mt-0.5">
                  (Incluye fondo inicial de apertura + cobros de ventas en efectivo)
                </span>
              </div>
            </div>
          ) : (
            /* Modo Administrador / Auditoría Z */
            <div className="space-y-1.5 border-b border-dashed border-slate-400 pb-3 mb-3 text-[11px]">
              <div className="font-bold text-[10px] text-slate-700 uppercase mb-1">
                -- DESGLOSE DE MOVIMIENTOS --
              </div>

              <div className="flex justify-between">
                <span>(+) Fondo Inicial:</span>
                <span className="font-semibold">{formatCurrency(shiftData.initialBalance)}</span>
              </div>

              {shiftData.totalSales !== undefined && (
                <div className="flex justify-between">
                  <span>(+) Ventas Totales:</span>
                  <span className="font-bold">{formatCurrency(shiftData.totalSales)}</span>
                </div>
              )}

              {shiftData.cashFromSales !== undefined && (
                <div className="flex justify-between pl-2 text-[10px] text-slate-700">
                  <span>• Efectivo recaudado:</span>
                  <span>{formatCurrency(shiftData.cashFromSales)}</span>
                </div>
              )}

              {shiftData.digitalFromSales !== undefined && (
                <div className="flex justify-between pl-2 text-[10px] text-slate-700">
                  <span>• Digital (Yape/Plin/Tarjetas):</span>
                  <span>{formatCurrency(shiftData.digitalFromSales)}</span>
                </div>
              )}

              {((shiftData.incomeMovements || 0) > 0 || (shiftData.expenseMovements || 0) > 0) && (
                <>
                  <div className="flex justify-between text-emerald-800">
                    <span>(+) Entradas de Caja Chica:</span>
                    <span>+{formatCurrency(shiftData.incomeMovements || 0)}</span>
                  </div>
                  <div className="flex justify-between text-rose-800">
                    <span>(-) Gastos de Caja Chica:</span>
                    <span>-{formatCurrency(shiftData.expenseMovements || 0)}</span>
                  </div>
                </>
              )}

              <div className="border-t border-dashed border-slate-400 pt-1.5 mt-1.5 flex justify-between font-bold">
                <span>(=) ESPERADO EN GAVETA:</span>
                <span>{formatCurrency(shiftData.expectedBalance || 0)}</span>
              </div>

              <div className="flex justify-between font-bold text-slate-900">
                <span>(=) CONTADO POR CAJERO:</span>
                <span>{formatCurrency(shiftData.actualBalance)}</span>
              </div>

              {diff !== null && (
                <div
                  className={`p-1.5 border border-dashed rounded text-center my-1.5 font-bold ${
                    isExact
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                      : diff < 0
                      ? 'border-rose-600 bg-rose-50 text-rose-900'
                      : 'border-amber-600 bg-amber-50 text-amber-900'
                  }`}
                >
                  <span className="block text-[10px]">
                    {isExact
                      ? 'CAJA CUADRADA EXACTA (S/ 0.00)'
                      : diff < 0
                      ? `FALTANTE EN GAVETA: ${formatCurrency(diff)}`
                      : `SOBRANTE EN GAVETA: +${formatCurrency(diff)}`}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Observaciones registradas */}
          {shiftData.notes && (
            <div className="border-b border-dashed border-slate-400 pb-2 mb-3 text-[10px]">
              <span className="font-bold block">OBSERVACIONES:</span>
              <p className="text-slate-700 mt-0.5 italic">{shiftData.notes}</p>
            </div>
          )}

          {/* Firmas de conformidad */}
          <div className="pt-4 text-center space-y-6 text-[10px]">
            <div>
              <div className="border-b border-slate-500 w-44 mx-auto mb-1"></div>
              <span className="font-bold block uppercase">{shiftData.cashierName}</span>
              <span className="text-slate-600 block">Firma Cajero(a) • Entregué Conforme</span>
              <span className="text-slate-500 text-[9px] block">DNI: _______________________</span>
            </div>

            <div>
              <div className="border-b border-slate-500 w-44 mx-auto mb-1"></div>
              <span className="font-bold block">ADMINISTRACIÓN</span>
              <span className="text-slate-600 block">Recibí Conforme • Dinero Verificado</span>
            </div>
          </div>

          {/* Pie de ticket */}
          <div className="mt-4 pt-2 border-t border-dashed border-slate-400 text-center text-[9px] text-slate-500">
            <span>Sistema Comercial Rodrigo • Emisión: {formatPeruTime(new Date())}</span>
          </div>
        </div>

        {/* Botones de acción */}
        <div className="pt-3 border-t border-slate-800 flex gap-3 print:hidden">
          <button
            onClick={onClose}
            className="w-1/3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-all cursor-pointer"
          >
            Cerrar
          </button>
          <button
            onClick={handlePrint}
            className="w-2/3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir en Tiquetera</span>
          </button>
        </div>
      </div>
    </div>
  );
};
