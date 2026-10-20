import React from 'react';
import { useToastStore, type ToastItem } from '../../store/useToastStore.js';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-[9999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-3 sm:px-0"
      aria-live="polite"
    >
      {toasts.map((toast: ToastItem) => {
        let borderClass = 'border-slate-700/80';
        let bgClass = 'bg-slate-900/95';
        let textClass = 'text-slate-200';
        let icon = <Info className="w-5 h-5 text-blue-400 shrink-0" />;

        if (toast.type === 'success') {
          borderClass = 'border-emerald-500/40';
          bgClass = 'bg-slate-900/95';
          textClass = 'text-emerald-100';
          icon = <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />;
        } else if (toast.type === 'error') {
          borderClass = 'border-rose-500/40';
          bgClass = 'bg-slate-900/95';
          textClass = 'text-rose-100';
          icon = <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />;
        } else if (toast.type === 'warning') {
          borderClass = 'border-amber-500/40';
          bgClass = 'bg-slate-900/95';
          textClass = 'text-amber-100';
          icon = <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />;
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-2xl border ${borderClass} ${bgClass} backdrop-blur-md shadow-2xl transition-all duration-200 animate-in fade-in slide-in-from-top-2`}
            role="alert"
          >
            <div className="mt-0.5">{icon}</div>

            <div className="flex-1 text-xs font-medium leading-relaxed pr-1 break-words">
              <span className={textClass}>{toast.message}</span>
            </div>

            <button
              onClick={() => removeToast(toast.id)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
              title="Cerrar notificación"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
