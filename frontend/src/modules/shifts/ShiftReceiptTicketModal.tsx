import React, { useState } from 'react';
import { formatCurrency, formatPeruDate, formatPeruTime, formatPeruDateTime } from '../../lib/utils.js';
import { useConfigStore } from '../../store/useConfigStore.js';
import { Printer, X } from 'lucide-react';

export interface SoldProductSummary {
  productId?: string;
  productName: string;
  barcode?: string | null;
  unitType?: string;
  quantity: number;
  totalRevenue: number;
}

export interface ShiftSaleSummary {
  id?: string;
  saleNumber: number | string;
  totalAmount: number;
  paymentMethod: string;
  createdAt: string | Date;
}

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
  totalSales?: number;
  cashFromSales?: number;
  digitalFromSales?: number;
  yapePlinSales?: number;
  cardSales?: number;
  pureCashSales?: number;
  mixedSales?: number;
  incomeMovements?: number;
  expenseMovements?: number;
  notes?: string | null;
  soldProducts?: SoldProductSummary[];
  salesList?: ShiftSaleSummary[];
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
  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm'>('80mm');

  if (!isOpen || !shiftData) return null;

  const isBlind = shiftData.isBlindAudit !== false && shiftData.expectedBalance === undefined;
  const diff = shiftData.difference !== null && shiftData.difference !== undefined ? shiftData.difference : null;
  const isExact = diff !== null && Math.abs(diff) < 0.05;

  const soldProducts = shiftData.soldProducts || [];
  const salesList = shiftData.salesList || [];
  const totalUnitsSold = soldProducts.reduce((acc, p) => acc + (Number(p.quantity) || 0), 0);

  const generatePrintHtml = () => {
    const is58 = paperWidth === '58mm';
    const containerWidth = is58 ? '50mm' : '72mm';
    const baseFontSize = is58 ? '9.5px' : '10.5px';
    const titleFontSize = is58 ? '12px' : '14px';

    const soldRowsHtml = soldProducts.length > 0
      ? soldProducts.map((p) => `
        <tr style="page-break-inside: avoid;">
          <td style="padding: 2px 0; vertical-align: top; font-weight: bold; width: 15%;">${p.quantity}</td>
          <td style="padding: 2px 4px 2px 0; vertical-align: top; width: 55%; word-break: break-word;">
            <div style="font-weight: 600;">${p.productName}</div>
            ${p.barcode ? `<div style="font-size: 8px; color: #444;">[${p.barcode}]</div>` : ''}
          </td>
          <td style="padding: 2px 0; vertical-align: top; text-align: right; font-weight: bold; width: 30%; white-space: nowrap;">
            ${formatCurrency(p.totalRevenue)}
          </td>
        </tr>
      `).join('')
      : `<tr><td colspan="3" style="text-align: center; padding: 4px 0; color: #555; font-style: italic;">(Sin ventas de artículos registradas)</td></tr>`;

    const salesListHtml = salesList.length > 0
      ? `
        <div style="border-top: 1px dashed #000; margin: 4px 0;"></div>
        <div style="font-weight: bold; text-align: center; margin-bottom: 2px; font-size: ${is58 ? '9px' : '10px'};">
          -- TICKETS EMITIDOS (${salesList.length}) --
        </div>
        <div style="font-size: ${is58 ? '8.5px' : '9.5px'}; line-height: 1.3;">
          ${salesList.slice(0, 15).map((s) => `
            <div style="display: flex; justify-content: space-between;">
              <span>#${String(s.saleNumber).padStart(6, '0')} (${formatPeruTime(s.createdAt)})</span>
              <span style="font-weight: bold;">${formatCurrency(s.totalAmount)}</span>
            </div>
          `).join('')}
          ${salesList.length > 15 ? `<div style="text-align: center; color: #555; font-size: 8.5px; margin-top: 1px;">...y ${salesList.length - 15} ventas más</div>` : ''}
        </div>
      `
      : '';

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Corte_Z_${shiftData.cajaIdentifier || 'Caja'}_${formatPeruDate(shiftData.closedAt || new Date()).replace(/\//g, '-')}</title>
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
              width: ${containerWidth} !important;
              max-width: ${containerWidth} !important;
              min-width: ${containerWidth} !important;
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
            .uppercase { text-transform: uppercase !important; }
            .divider { border-bottom: 1px dashed #000 !important; margin: 4px 0 !important; }
            .divider-double { border-bottom: 2px solid #000 !important; margin: 4px 0 !important; }
            .row { display: flex !important; justify-content: space-between !important; margin-bottom: 1.5px !important; }
            .box { border: 1px solid #000 !important; padding: 4px !important; margin: 4px 0 !important; text-align: center !important; }
            table { width: 100% !important; border-collapse: collapse !important; margin: 2px 0 !important; font-size: inherit !important; }
            th { border-bottom: 1px dashed #000 !important; padding: 2px 0 !important; text-align: left !important; font-weight: bold !important; }
            td { padding: 1.5px 0 !important; }
            .sign-box { margin-top: 18px !important; text-align: center !important; }
            .sign-line { border-top: 1px solid #000 !important; width: 75% !important; margin: 20px auto 3px auto !important; }
          </style>
        </head>
        <body>
          <div class="ticket-container">
            <!-- MEMBRETE EMPRESA -->
          <div class="text-center">
            <div class="font-bold uppercase" style="font-size: ${titleFontSize}; letter-spacing: 1px;">${config.name}</div>
            ${config.subtitle ? `<div style="font-size: 9px; margin-top: 1px;">${config.subtitle}</div>` : ''}
            <div style="font-size: 9px; margin-top: 1px;">RUC: ${config.ruc} ${config.phone ? `• TEL: ${config.phone}` : ''}</div>
            <div style="font-size: 8.5px;">${config.address}</div>

            <div class="divider"></div>
            <div class="font-bold uppercase" style="font-size: ${is58 ? '10px' : '11px'};">
              ${isBlind ? '*** CORTE DE CAJA - ENTREGA ***' : '*** CORTE Z - AUDITORÍA GENERAL ***'}
            </div>
            <div style="font-size: 8.5px; color: #333;">
              ${isBlind ? 'Comprobante Oficial de Arqueo Físico' : 'Reporte Consolidado de Cierre Fiscal'}
            </div>
            <div class="divider"></div>
          </div>

          <!-- DATOS DE TURNO -->
          <div style="margin-bottom: 3px;">
            <div class="row"><span>CAJA:</span><span class="font-bold">${shiftData.cajaName} ${shiftData.cajaIdentifier ? `(${shiftData.cajaIdentifier})` : ''}</span></div>
            <div class="row"><span>CAJERO(A):</span><span class="font-bold">${shiftData.cashierName}</span></div>
            <div class="row"><span>APERTURA:</span><span>${formatPeruTime(shiftData.openedAt)} (${formatPeruDate(shiftData.openedAt)})</span></div>
            <div class="row"><span>CIERRE:</span><span>${shiftData.closedAt ? `${formatPeruTime(shiftData.closedAt)} (${formatPeruDate(shiftData.closedAt)})` : 'EN CURSO'}</span></div>
            ${shiftData.salesCount !== undefined ? `<div class="row"><span>TICKETS EMITIDOS:</span><span class="font-bold">${shiftData.salesCount} ventas</span></div>` : ''}
          </div>

          <!-- RESUMEN DE ARTÍCULOS VENDIDOS (SOLICITADO POR EL USUARIO) -->
          <div class="divider"></div>
          <div class="text-center font-bold uppercase" style="font-size: ${is58 ? '9.5px' : '10.5px'}; margin-bottom: 2px;">
            -- RESUMEN DE ARTÍCULOS VENDIDOS --
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 15%;">CANT</th>
                <th style="width: 55%;">DESCRIPCIÓN</th>
                <th style="width: 30%; text-align: right;">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              ${soldRowsHtml}
            </tbody>
          </table>
          <div class="row font-bold" style="border-top: 1px dashed #000; padding-top: 2px; margin-top: 2px;">
            <span>TOTAL UNIDADES:</span>
            <span>${totalUnitsSold} unds.</span>
          </div>

          <!-- TICKETS EMITIDOS (SI HAY LISTA) -->
          ${salesListHtml}

          <!-- DESGLOSE DE MOVIMIENTOS -->
          <div class="divider"></div>
          ${isBlind ? `
            <div class="row">
              <span>FONDO INICIAL:</span>
              <span class="font-bold">${formatCurrency(shiftData.initialBalance)}</span>
            </div>
            <div class="box">
              <div style="font-size: 8.5px; font-weight: bold; text-transform: uppercase;">TOTAL EFECTIVO ENTREGADO EN GAVETA</div>
              <div style="font-size: 13px; font-weight: 900; margin: 2px 0;">${formatCurrency(shiftData.actualBalance)}</div>
              <div style="font-size: 8px; color: #444;">(Base de apertura + Cobros en efectivo)</div>
            </div>
          ` : `
            <div class="text-center font-bold uppercase" style="font-size: ${is58 ? '9.5px' : '10px'}; margin-bottom: 2px;">
              -- DESGLOSE DE MOVIMIENTOS --
            </div>
            <div class="row">
              <span>(+) Fondo Inicial:</span>
              <span class="font-bold">${formatCurrency(shiftData.initialBalance)}</span>
            </div>
            ${shiftData.totalSales !== undefined ? `
              <div class="row">
                <span>(+) Ventas Totales:</span>
                <span class="font-bold">${formatCurrency(shiftData.totalSales)}</span>
              </div>
            ` : ''}
            ${shiftData.cashFromSales !== undefined ? `
              <div class="row" style="padding-left: 6px; font-size: 9px;">
                <span>• Efectivo cobrado:</span>
                <span>${formatCurrency(shiftData.cashFromSales)}</span>
              </div>
            ` : ''}
            ${shiftData.digitalFromSales !== undefined ? `
              <div class="row" style="padding-left: 6px; font-size: 9px;">
                <span>• Digital (Yape/Plin/Tarj):</span>
                <span>${formatCurrency(shiftData.digitalFromSales)}</span>
              </div>
            ` : ''}
            ${((shiftData.incomeMovements || 0) > 0 || (shiftData.expenseMovements || 0) > 0) ? `
              <div class="row"><span>(+) Ingresos Caja Chica:</span><span>+${formatCurrency(shiftData.incomeMovements || 0)}</span></div>
              <div class="row"><span>(-) Egresos Caja Chica:</span><span>-${formatCurrency(shiftData.expenseMovements || 0)}</span></div>
            ` : ''}
            <div class="divider"></div>
            <div class="row font-bold">
              <span>(=) ESPERADO EN GAVETA:</span>
              <span>${formatCurrency(shiftData.expectedBalance || 0)}</span>
            </div>
            <div class="row font-bold">
              <span>(=) CONTADO POR CAJERO:</span>
              <span>${formatCurrency(shiftData.actualBalance)}</span>
            </div>
            ${diff !== null ? `
              <div class="box font-bold" style="font-size: 9px; margin-top: 3px;">
                ${isExact
                  ? 'CAJA CUADRADA EXACTA (S/ 0.00)'
                  : diff < 0
                  ? `FALTANTE EN GAVETA: ${formatCurrency(diff)}`
                  : `SOBRANTE EN GAVETA: +${formatCurrency(diff)}`}
              </div>
            ` : ''}
          `}

          <!-- OBSERVACIONES -->
          ${shiftData.notes ? `
            <div class="divider"></div>
            <div style="font-size: 9px;">
              <span class="font-bold">OBSERVACIONES:</span>
              <div style="font-style: italic; margin-top: 1px;">${shiftData.notes}</div>
            </div>
          ` : ''}

          <!-- FIRMAS -->
          <div class="sign-box">
            <div class="sign-line"></div>
            <div class="font-bold uppercase" style="font-size: 9px;">${shiftData.cashierName}</div>
            <div style="font-size: 8.5px; color: #444;">Firma Cajero(a) • Entregué Conforme</div>

            <div class="sign-line" style="margin-top: 18px;"></div>
            <div class="font-bold" style="font-size: 9px;">ADMINISTRACIÓN</div>
            <div style="font-size: 8.5px; color: #444;">Recibí Conforme • Dinero Verificado</div>
          </div>

          <!-- PIE DE TICKET -->
          <div class="divider" style="margin-top: 8px;"></div>
          <div class="text-center" style="font-size: 8px; color: #555;">
            Sistema Comercial Rodrigo • Emisión: ${formatPeruDateTime(new Date(), true)}
          </div>
          </div>
        </body>
      </html>
    `;
  };

  const handlePrint = () => {
    const fullHtml = generatePrintHtml();

    let printIframe = document.getElementById('thermal-print-iframe') as HTMLIFrameElement;
    if (!printIframe) {
      printIframe = document.createElement('iframe');
      printIframe.id = 'thermal-print-iframe';
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

    iframeDoc.open();
    iframeDoc.write(fullHtml);
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

        {/* Header Modal */}
        <div className="text-center pb-3 border-b border-slate-800 print:hidden">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto mb-2">
            <Printer className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">
            {isBlind ? 'Ticket de Entrega de Turno (Corte de Caja)' : 'Ticket de Auditoría de Cierre (Corte Z)'}
          </h3>
          <p className="text-xs text-slate-400">
            Formato optimizado para tiqueteras térmicas continuas
          </p>

          {/* Selector de Ancho de Tiquetera (80mm vs 58mm) */}
          <div className="mt-3 flex items-center justify-center gap-2">
            <span className="text-[11px] text-slate-400">Ancho de rollo:</span>
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
          id="printable-shift-ticket"
          className={`my-3 p-4 bg-white text-slate-900 rounded-2xl font-mono text-xs shadow-inner overflow-y-auto max-h-[460px] mx-auto w-full transition-all ${
            paperWidth === '58mm' ? 'max-w-[290px]' : 'max-w-[340px]'
          }`}
        >
          {/* Membrete Negocio */}
          <div className="text-center border-b border-dashed border-slate-400 pb-2.5 mb-2.5">
            <h4 className="text-base font-extrabold tracking-wider uppercase">{config.name}</h4>
            {config.subtitle && (
              <p className="text-[11px] text-slate-600 font-sans">{config.subtitle}</p>
            )}
            <p className="text-[10px] text-slate-600 mt-1">
              RUC: {config.ruc} {config.phone ? `• TEL: ${config.phone}` : ''}
            </p>
            <p className="text-[10px] text-slate-600">{config.address}</p>

            <div className="mt-2 pt-2 border-t border-dashed border-slate-400">
              <span className="font-extrabold text-[12px] block tracking-wide uppercase">
                {isBlind ? '*** CORTE DE CAJA - ENTREGA ***' : '*** CORTE Z - AUDITORÍA GENERAL ***'}
              </span>
              <span className="text-[10px] text-slate-500 font-sans block">
                {isBlind ? 'Comprobante Oficial de Arqueo Físico' : 'Reporte Consolidado de Cierre Fiscal'}
              </span>
            </div>
          </div>

          {/* Información del Turno */}
          <div className="text-[11px] space-y-1 border-b border-dashed border-slate-400 pb-2 mb-2">
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

          {/* RESUMEN DE ARTÍCULOS VENDIDOS EN EL TURNO (¡NUEVO!) */}
          <div className="border-b border-dashed border-slate-400 pb-2.5 mb-2.5">
            <div className="font-bold text-[10px] text-slate-800 uppercase mb-1.5 flex items-center justify-between">
              <span>-- ARTÍCULOS VENDIDOS EN TURNO --</span>
              <span className="font-bold text-slate-900">{totalUnitsSold} unds.</span>
            </div>

            {soldProducts.length > 0 ? (
              <table className="w-full text-[10px] border-collapse">
                <thead>
                  <tr className="border-b border-dashed border-slate-400 text-slate-700">
                    <th className="py-1 text-left w-10 font-bold">CANT</th>
                    <th className="py-1 text-left font-bold">DESCRIPCIÓN</th>
                    <th className="py-1 text-right w-16 font-bold">TOTAL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dashed divide-slate-200">
                  {soldProducts.map((p, idx) => (
                    <tr key={idx} className="py-0.5">
                      <td className="py-1 align-top font-bold text-slate-900">{p.quantity}</td>
                      <td className="py-1 align-top pr-1 text-slate-900 leading-tight">
                        <span className="font-semibold block">{p.productName}</span>
                        {p.barcode && <span className="text-[8.5px] text-slate-600">[{p.barcode}]</span>}
                      </td>
                      <td className="py-1 align-top text-right font-bold text-slate-900 whitespace-nowrap">
                        {formatCurrency(p.totalRevenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-[10px] text-slate-500 italic py-1 text-center">
                (Sin ventas de artículos registradas en este turno)
              </p>
            )}
          </div>

          {/* TICKETS EMITIDOS (SI HAY LISTA) */}
          {salesList.length > 0 && (
            <div className="border-b border-dashed border-slate-400 pb-2 mb-2 text-[10px]">
              <div className="font-bold text-slate-800 uppercase mb-1 flex justify-between">
                <span>-- LISTA DE TICKETS --</span>
                <span>{salesList.length} total</span>
              </div>
              <div className="space-y-0.5 max-h-36 overflow-y-auto pr-1">
                {salesList.map((s, idx) => (
                  <div key={idx} className="flex justify-between text-[9.5px]">
                    <span className="text-slate-700">#{String(s.saleNumber).padStart(6, '0')} ({formatPeruTime(s.createdAt)})</span>
                    <span className="font-bold text-slate-900">{formatCurrency(s.totalAmount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DESGLOSE SEGÚN MODO (Cajero Arqueo Ciego vs Admin Auditoría Z) */}
          {isBlind ? (
            /* Modo Cajero */
            <div className="space-y-2 mb-2.5">
              <div className="flex justify-between text-[11px]">
                <span>FONDO INICIAL (BASE):</span>
                <span className="font-semibold">{formatCurrency(shiftData.initialBalance)}</span>
              </div>

              {/* Recuadro Destacado con el Dinero Físico Entregado */}
              <div className="p-2 border-2 border-black rounded text-center my-2 bg-slate-50">
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
            <div className="space-y-1.5 border-b border-dashed border-slate-400 pb-2.5 mb-2.5 text-[11px]">
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

              <div className="border-t border-dashed border-slate-400 pt-1 mt-1 flex justify-between font-bold">
                <span>(=) ESPERADO EN GAVETA:</span>
                <span>{formatCurrency(shiftData.expectedBalance || 0)}</span>
              </div>

              <div className="flex justify-between font-bold text-slate-900">
                <span>(=) CONTADO POR CAJERO:</span>
                <span>{formatCurrency(shiftData.actualBalance)}</span>
              </div>

              {diff !== null && (
                <div
                  className={`p-1.5 border border-dashed rounded text-center my-1 font-bold ${
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
            <div className="border-b border-dashed border-slate-400 pb-2 mb-2 text-[10px]">
              <span className="font-bold block">OBSERVACIONES:</span>
              <p className="text-slate-700 mt-0.5 italic">{shiftData.notes}</p>
            </div>
          )}

          {/* Firmas de conformidad */}
          <div className="pt-3 text-center space-y-5 text-[10px]">
            <div>
              <div className="border-b border-slate-500 w-40 mx-auto mb-1"></div>
              <span className="font-bold block uppercase">{shiftData.cashierName}</span>
              <span className="text-slate-600 block text-[9.5px]">Firma Cajero(a) • Entregué Conforme</span>
            </div>

            <div>
              <div className="border-b border-slate-500 w-40 mx-auto mb-1"></div>
              <span className="font-bold block">ADMINISTRACIÓN</span>
              <span className="text-slate-600 block text-[9.5px]">Recibí Conforme • Dinero Verificado</span>
            </div>
          </div>

          {/* Pie de ticket */}
          <div className="mt-3 pt-2 border-t border-dashed border-slate-400 text-center text-[9px] text-slate-500">
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
            <span>Imprimir en Tiquetera ({paperWidth})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
