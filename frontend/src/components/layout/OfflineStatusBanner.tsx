import React from 'react';
import { useOfflineSyncStore } from '../../store/useOfflineSyncStore.js';
import { Wifi, WifiOff, RefreshCw, CheckCircle } from 'lucide-react';

export const OfflineStatusBanner: React.FC = () => {
  const {
    isOnline,
    pendingCount,
    isSyncing,
    syncFeedbackMessage,
    syncPendingSales,
  } = useOfflineSyncStore();

  // Si está online, no hay ventas pendientes y no hay mensaje, no estorba
  if (isOnline && pendingCount === 0 && !syncFeedbackMessage) {
    return null;
  }

  return (
    <div className="w-full transition-all duration-300">
      {/* 1. Alerta cuando se pierde la conexión a internet */}
      {!isOnline && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-3 sm:px-6 py-2.5 text-amber-300 text-xs flex flex-wrap items-center justify-between gap-2 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-lg bg-amber-500/20 text-amber-400">
              <WifiOff className="w-4 h-4 animate-pulse" />
            </span>
            <span>
              <strong className="font-semibold text-white">Modo Sin Conexión (Offline) activado:</strong>{' '}
              Se cortó el internet. Puede seguir vendiendo e imprimiendo normalmente en caja; las ventas se guardarán de forma segura en este equipo.
            </span>
          </div>
          {pendingCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-200 font-bold text-[11px] border border-amber-400/30">
                {pendingCount} venta{pendingCount > 1 ? 's' : ''} pendiente{pendingCount > 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 2. Alerta cuando volvió el internet pero hay ventas pendientes por subir */}
      {isOnline && pendingCount > 0 && (
        <div className="bg-sky-500/15 border-b border-sky-500/30 px-3 sm:px-6 py-2 text-sky-200 text-xs flex flex-wrap items-center justify-between gap-2 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-lg bg-sky-500/20 text-sky-300">
              <Wifi className="w-4 h-4 text-emerald-400" />
            </span>
            <span>
              <strong className="font-semibold text-white">Conexión restablecida:</strong> Tienes{' '}
              <strong className="text-emerald-400">{pendingCount}</strong> venta
              {pendingCount > 1 ? 's' : ''} registrada{pendingCount > 1 ? 's' : ''} offline listas para sincronizar con la nube.
            </span>
          </div>
          <button
            onClick={() => syncPendingSales()}
            disabled={isSyncing}
            className="px-3 py-1 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Ahora'}</span>
          </button>
        </div>
      )}

      {/* 3. Notificación de sincronización exitosa */}
      {syncFeedbackMessage && (
        <div className="bg-emerald-500/15 border-b border-emerald-500/30 px-3 sm:px-6 py-2 text-emerald-300 text-xs flex items-center justify-between gap-2 shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span>{syncFeedbackMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export const ConnectionStatusBadge: React.FC = () => {
  const { isOnline, pendingCount, isSyncing, syncPendingSales } = useOfflineSyncStore();

  return (
    <div className="flex items-center gap-2">
      <div
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all ${
          isOnline
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
        }`}
        title={isOnline ? 'Conexión a internet activa' : 'Sin conexión a internet (Modo Offline)'}
      >
        <span className="relative flex h-2 w-2 shrink-0">
          {isOnline ? (
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          ) : (
            <>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </>
          )}
        </span>
        <span className="hidden sm:inline">{isOnline ? 'Online' : 'Offline'}</span>
      </div>

      {pendingCount > 0 && (
        <button
          onClick={() => syncPendingSales()}
          disabled={!isOnline || isSyncing}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition-all cursor-pointer"
          title={`${pendingCount} ventas pendientes de sincronizar`}
        >
          <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{pendingCount}</span>
          <span className="hidden md:inline">pendientes</span>
        </button>
      )}
    </div>
  );
};
