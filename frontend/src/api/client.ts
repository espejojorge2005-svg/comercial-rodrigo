const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'https://comercial-rodrigo-api.onrender.com';

interface RequestOptions extends RequestInit {
  data?: any;
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  const token = localStorage.getItem('auth_token');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config: RequestInit = {
    ...options,
    headers,
  };

  if (options.data) {
    config.body = JSON.stringify(options.data);
  }

  const url = `${API_BASE_URL.replace(/\/$/, '')}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  try {
    const response = await fetch(url, config);

    if (!response.ok) {
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
      throw new Error(errorMsg);
    }

    return (await response.json()) as T;
  } catch (error: any) {
    if (
      error instanceof TypeError &&
      (error.message.includes('fetch') || error.message.includes('NetworkError') || error.message.includes('Failed'))
    ) {
      const friendlyError = new Error(
        'No se pudo conectar con el servidor backend. Si está en Render (plan gratuito), el servidor puede estar despertando tras inactividad (~30-50s). Por favor, reintenta en unos instantes.'
      );
      console.error(`API Error on [${options.method || 'GET'}] ${endpoint}:`, error);
      throw friendlyError;
    }
    console.error(`API Error on [${options.method || 'GET'}] ${endpoint}:`, error);
    throw error;
  }
}

export async function checkBackendHealth(): Promise<{ ok: boolean; message?: string }> {
  const url = `${API_BASE_URL.replace(/\/$/, '')}/health`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      return { ok: true, message: 'En línea' };
    }
    return { ok: false, message: `Respuesta ${res.status}` };
  } catch {
    return { ok: false, message: 'Desconectado o despertando' };
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
    const match = disposition.match(/filename="?([^"]+)"?/);
    if (match && match[1]) filename = match[1];
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
