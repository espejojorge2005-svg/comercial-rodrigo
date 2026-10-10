import React, { useState, useEffect } from 'react';
import { useConfigStore } from '../../store/useConfigStore.js';
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
    }
  }, [isOpen, config]);

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
          <div className="w-11 h-11 rounded-2xl bg-slate-800 text-slate-200 border border-slate-700/80 flex items-center justify-center">
            <Store className="w-6 h-6" />
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
                    <span>{new Date().toLocaleDateString()}</span>
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
