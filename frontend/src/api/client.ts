import { toast } from '../store/useToastStore.js';

const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'https://comercial-rodrigo-api.onrender.com';

interface RequestOptions extends RequestInit {
  data?: any;
  timeoutMs?: number;
}

let unauthorizedHandler: (() => void) | null = null;

export function registerUnauthorizedHandler(handler: () => void): void {
  unauthorizedHandler = handler;
}

function handleSessionExpired(): void {
  toast.error('Tu sesión ha expirado. Por favor, ingresa tus credenciales nuevamente.');
  if (unauthorizedHandler) {
    unauthorizedHandler();
  } else {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
  }
}

function isNonSession401Endpoint(endpoint: string): boolean {
  return (
    endpoint.includes('/auth/login') ||
    endpoint.includes('/auth/verify-pin') ||
    endpoint.includes('/void')
  );
}

function isFetchNetworkError(error: any): boolean {
  if (!error) return false;
  if (error.name === 'AbortError') return true;
  if (error instanceof TypeError) {
    const msg = (error.message || '').toLowerCase();
    return (
      msg.includes('fetch') ||
      msg.includes('networkerror') ||
      msg.includes('failed') ||
      msg.includes('load failed') ||
      msg.includes('network')
    );
  }
  return false;
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  const token = localStorage.getItem('auth_token');
  const { data, timeoutMs = 20000, ...restOptions } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(restOptions.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const externalSignal = restOptions.signal;
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const config: RequestInit = {
    ...restOptions,
    headers,
    signal: controller.signal,
  };

  if (data !== undefined) {
    config.body = JSON.stringify(data);
  }

  const url = `${API_BASE_URL.replace(/\/$/, '')}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  try {
    const response = await fetch(url, config);

    if (!response.ok) {
      if (response.status === 401 && !isNonSession401Endpoint(endpoint)) {
        handleSessionExpired();
      }

      let errorMsg = `Error HTTP ${response.status}`;
      try {
        const errorJson = await response.json();
        if (Array.isArray(errorJson.message)) {
          errorMsg = errorJson.message.join(', ');
        } else if (errorJson.message) {
          errorMsg = errorJson.message;
        }
      } catch {
        // Ignorar error de parsing y mantener mensaje genérico
      }
      const httpError: any = new Error(errorMsg);
      httpError.statusCode = response.status;
      throw httpError;
    }

    return (await response.json()) as T;
  } catch (error: any) {
    if (isFetchNetworkError(error)) {
      const friendlyError: any = new Error(
        'No se pudo conectar con el servidor backend. Si está en Render (plan gratuito), el servidor puede estar despertando tras inactividad (~30-50s). Por favor, reintenta en unos instantes.',
      );
      friendlyError.isNetworkError = true;
      console.error(`API Error on [${restOptions.method || 'GET'}] ${endpoint}:`, error);
      throw friendlyError;
    }
    console.error(`API Error on [${restOptions.method || 'GET'}] ${endpoint}:`, error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function checkBackendHealth(): Promise<{ ok: boolean; message?: string }> {
  const url = `${API_BASE_URL.replace(/\/$/, '')}/health`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (res.ok) {
      return { ok: true, message: 'En línea' };
    }
    return { ok: false, message: `Respuesta ${res.status}` };
  } catch {
    return { ok: false, message: 'Desconectado o despertando' };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function downloadReportBlob(endpoint: string, fallbackFilename: string): Promise<void> {
  const token = localStorage.getItem('auth_token');
  const url = `${API_BASE_URL.replace(/\/$/, '')}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      handleSessionExpired();
    }
    let errMsg = `Error al descargar reporte (${response.status})`;
    try {
      const errJson = await response.json();
      if (errJson.message) errMsg = errJson.message;
    } catch {
      // Ignorar
    }
    throw new Error(errMsg);
  }

  // Obtener nombre del archivo de Content-Disposition si existe
  const disposition = response.headers.get('Content-Disposition');
  let filename = fallbackFilename;
  if (disposition && disposition.includes('filename=')) {
    const match = disposition.match(/filename="?([^";]+)"?/);
    if (match && match[1]) filename = match[1].trim();
  }

  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(downloadUrl);
}
