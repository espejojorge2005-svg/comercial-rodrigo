import React, { useState, useEffect } from 'react';
import { useConfigStore } from '../../store/useConfigStore.js';
import { formatPeruDate } from '../../lib/utils.js';
import {
  X,
  Store,
  MapPin,
  FileText,
  Phone,
  CheckCircle,
  AlertCircle,
  Printer,
  Save,
  Zap,
  Info,
} from 'lucide-react';

interface StoreSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const StoreSettingsModal: React.FC<StoreSettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { config, updateConfig, isLoading } = useConfigStore();

  const [name, setName] = useState(config.name);
  const [subtitle, setSubtitle] = useState(config.subtitle);
  const [ruc, setRuc] = useState(config.ruc);
  const [phone, setPhone] = useState(config.phone);
  const [address, setAddress] = useState(config.address);
  const [footerText, setFooterText] = useState(config.footerText);

  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pos_thermal_paper_width');
      if (saved === '58mm' || saved === '80mm') return saved;
    }
    return '80mm';
  });

  const [autoPrintEnabled, setAutoPrintEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('pos_thermal_auto_print') === 'true';
    }
    return false;
  });

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(config.name);
      setSubtitle(config.subtitle);
      setRuc(config.ruc);
      setPhone(config.phone);
      setAddress(config.address);
      setFooterText(config.footerText);
      setError(null);
      setSuccessMsg(null);
      if (typeof window !== 'undefined') {
        const savedW = localStorage.getItem('pos_thermal_paper_width');
        if (savedW === '58mm' || savedW === '80mm') setPaperWidth(savedW);
        setAutoPrintEnabled(localStorage.getItem('pos_thermal_auto_print') === 'true');
      }
    }
  }, [isOpen, config]);

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

  const handlePrintSample = () => {
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
    if (!iframeDoc) return;

    const is58 = paperWidth === '58mm';
    const targetWidth = is58 ? '48mm' : '72mm';
    const baseFontSize = is58 ? '9.5px' : '11px';

    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>PRUEBA-TIQUETERA</title>
          <style>
            @page { margin: 0mm; size: auto; }
            * { box-sizing: border-box !important; margin: 0; padding: 0; }
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
            }
            .text-center { text-align: center !important; }
            .text-right { text-align: right !important; }
            .font-bold { font-weight: bold !important; }
            .font-extrabold { font-weight: 800 !important; }
            .border-b { border-bottom: 1px dashed #000 !important; }
            .border-t { border-top: 1px dashed #000 !important; }
            table { width: 100% !important; border-collapse: collapse !important; font-size: inherit !important; margin: 3px 0 !important; }
            th { text-align: left !important; border-bottom: 1px dashed #000 !important; padding: 2px 0 !important; }
            td { padding: 2px 0 !important; }
          </style>
        </head>
        <body>
          <div class="ticket-container">
            <div class="text-center border-b" style="padding-bottom: 5px; margin-bottom: 5px;">
              <div class="font-extrabold" style="font-size: 13px;">${name || 'COMERCIAL RODRIGO'}</div>
              <div style="font-size: 10px;">${subtitle || 'VENTA POR MAYOR Y MENOR'}</div>
              <div style="font-size: 10px;">RUC: ${ruc || '10458923011'} • Tel: ${phone || '(01) 987-654-321'}</div>
              <div style="font-size: 9px;">${address || 'Av. Principal 1234, Lima'}</div>
              <div class="font-bold border-t" style="margin-top: 5px; padding-top: 3px;">
                *** TICKET DE PRUEBA TÉRMICA (${paperWidth}) ***
              </div>
            </div>
            <div style="font-size: 10px; margin-bottom: 5px;">
              <div>FECHA: ${new Date().toLocaleString('es-PE')}</div>
              <div>ESTADO: TIQUETERA CALIBRADA</div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>CANT</th>
                  <th>DESCRIPCIÓN</th>
                  <th class="text-right">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>1</td>
                  <td>PRUEBA DE ANCHO ${paperWidth}</td>
                  <td class="text-right">S/. 12.00</td>
                </tr>
                <tr>
                  <td>2</td>
                  <td>PRODUCTO DEMOSTRACIÓN</td>
                  <td class="text-right">S/. 18.00</td>
                </tr>
              </tbody>
            </table>
            <div class="border-t font-extrabold text-right" style="padding-top: 4px; font-size: 12px;">
              TOTAL: S/. 30.00
            </div>
            <div class="text-center border-t" style="margin-top: 8px; padding-top: 5px; font-size: 9px;">
              ${footerText || '¡GRACIAS POR SU COMPRA!'}
            </div>
          </div>
        </body>
      </html>
    `);
    iframeDoc.close();

    setTimeout(() => {
      printIframe.contentWindow?.focus();
      printIframe.contentWindow?.print();
    }, 280);
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!ruc.trim()) {
      setError('El número de RUC es obligatorio');
      return;
    }

    if (!address.trim()) {
      setError('La dirección o localización es obligatoria');
      return;
    }

    try {
      await updateConfig({
        name: name.trim(),
        subtitle: subtitle.trim(),
        ruc: ruc.trim(),
        phone: phone.trim(),
        address: address.trim(),
        footerText: footerText.trim(),
      });

      setSuccessMsg('¡Datos del negocio y tickets actualizados exitosamente!');
      setTimeout(() => {
        onClose();
      }, 1300);
    } catch (err: any) {
      setError(err.message || 'Error al guardar la configuración');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative text-slate-100 max-h-[92vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute right-5 top-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Encabezado */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-11 h-11 rounded-2xl bg-white border border-slate-700/80 flex items-center justify-center shadow-sm overflow-hidden p-1 shrink-0">
            <img src="/logo-icon.png" alt="Comercial Rodrigo" className="w-full h-full object-contain" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">Configuración del Negocio & Tickets</h3>
            <p className="text-xs text-slate-400">
              Personaliza el RUC, dirección física, teléfono y membrete para comprobantes térmicos.
            </p>
          </div>
        </div>

        {error && (
          <div className="my-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="my-4 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-4">
          {/* Formulario (7 Columnas) */}
          <form onSubmit={handleSubmit} className="lg:col-span-7 space-y-3.5 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Razón Social / Nombre:
                </label>
                <div className="relative">
                  <Store className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="COMERCIAL RODRIGO"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl pl-8.5 pr-3 py-2 text-white font-bold outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Giro / Subtítulo:
                </label>
                <input
                  type="text"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="VENTA POR MAYOR Y MENOR"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-3 py-2 text-white outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Número de RUC:
                </label>
                <div className="relative">
                  <FileText className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    maxLength={11}
                    value={ruc}
                    onChange={(e) => setRuc(e.target.value)}
                    placeholder="10458923011"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl pl-8.5 pr-3 py-2 text-white font-mono font-bold outline-none tracking-wider"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Teléfono / WhatsApp:
                </label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(01) 987-654-321"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl pl-8.5 pr-3 py-2 text-white outline-none"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1">
                Localización / Dirección Física:
              </label>
              <div className="relative">
                <MapPin className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Av. Principal 1234, Lima"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl pl-8.5 pr-3 py-2 text-white outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1">
                Mensaje al Pie del Ticket:
              </label>
              <textarea
                rows={2}
                value={footerText}
                onChange={(e) => setFooterText(e.target.value)}
                placeholder="¡GRACIAS POR SU COMPRA! Comercial Rodrigo siempre a su servicio"
                className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl p-2.5 text-white outline-none resize-none"
              />
            </div>

            <div className="pt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-sm transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {isLoading ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </form>

          {/* Vista Previa del Ticket Térmico en Tiempo Real (5 Columnas) */}
          <div className="lg:col-span-5 bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-300 mb-3 pb-2 border-b border-slate-800">
                <Printer className="w-4 h-4 text-indigo-400" />
                <span>Vista Previa del Comprobante</span>
              </div>

              {/* Mockup de Ticket Térmico */}
              <div className="bg-white text-slate-900 rounded-xl p-3.5 font-mono text-[11px] shadow-sm">
                <div className="text-center border-b border-dashed border-slate-400 pb-2 mb-2">
                  <h5 className="font-extrabold text-xs tracking-wider uppercase">
                    {name || 'NOMBRE DEL NEGOCIO'}
                  </h5>
                  {subtitle && (
                    <p className="text-[10px] text-slate-600 font-sans">{subtitle}</p>
                  )}
                  <p className="text-[9px] text-slate-500 mt-0.5">
                    RUC: <strong className="text-slate-800">{ruc || '00000000000'}</strong>
                    {phone ? ` • Tel: ${phone}` : ''}
                  </p>
                  <p className="text-[9px] text-slate-500">{address || 'Dirección del local'}</p>
                </div>

                <div className="text-[9px] text-slate-500 space-y-0.5 border-b border-dashed border-slate-300 pb-1.5 mb-1.5">
                  <div className="flex justify-between">
                    <span>TICKET #:</span>
                    <span className="font-bold text-slate-800">#000124</span>
                  </div>
                  <div className="flex justify-between">
                    <span>FECHA:</span>
                    <span>{formatPeruDate(new Date())}</span>
                  </div>
                </div>

                <div className="text-[9px] text-slate-600 space-y-1 mb-2">
                  <div className="flex justify-between">
                    <span>1x Arroz Costeño Extra 1kg</span>
                    <span className="font-bold text-slate-800">S/. 4.80</span>
                  </div>
                  <div className="flex justify-between">
                    <span>2x Aceite Primor Premium 1L</span>
                    <span className="font-bold text-slate-800">S/. 22.00</span>
                  </div>
                </div>

                <div className="border-t border-slate-300 pt-1 text-right text-xs font-extrabold text-slate-900">
                  TOTAL: S/. 26.80
                </div>

                <div className="text-center text-[9px] text-slate-500 border-t border-dashed border-slate-400 pt-2 mt-2">
                  <p className="font-bold whitespace-pre-line">
                    {footerText || '¡GRACIAS POR SU COMPRA!'}
                  </p>
                </div>
              </div>

              {/* Ajustes de Impresora Térmica */}
              <div className="mt-4 p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-300">Ancho de Rollo:</span>
                  <div className="inline-flex p-0.5 bg-slate-950 border border-slate-800 rounded-lg">
                    <button
                      type="button"
                      onClick={() => handlePaperWidthChange('80mm')}
                      className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
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
                      className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                        paperWidth === '58mm'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      58mm
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                  <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                    <Zap className="w-3 h-3 text-amber-400" />
                    <span>Auto-imprimir en cobro:</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleToggleAutoPrint}
                    className={`px-2 py-0.5 rounded-lg border text-[10.5px] font-bold transition-all cursor-pointer ${
                      autoPrintEnabled
                        ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/40'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    {autoPrintEnabled ? 'ACTIVADO' : 'DESACTIVADO'}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handlePrintSample}
                  className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-slate-700/80 mt-1 shadow-sm"
                  title="Enviar un comprobante de prueba a la tiquetera física para comprobar alineación y corte"
                >
                  <Printer className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Imprimir Ticket de Prueba ({paperWidth})</span>
                </button>
              </div>

              {/* Tip Modo Kiosco */}
              <div className="mt-2.5 p-2 rounded-xl bg-blue-950/20 border border-blue-900/30 text-[10px] text-blue-300 flex items-start gap-1.5 leading-snug">
                <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Tip de Impresión Rápida:</strong> Para imprimir sin que aparezca la ventana de confirmación del navegador, añade <code className="bg-slate-900 px-1 py-0.5 rounded text-blue-200 font-mono">--kiosk-printing</code> al acceso directo de Chrome o Edge.
                </span>
              </div>
            </div>

            <p className="text-[10px] text-slate-500 text-center mt-3">
              Los cambios se reflejarán inmediatamente en todas las impresiones térmicas.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
