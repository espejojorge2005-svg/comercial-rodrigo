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
    console.error(`API Error on [${options.method || 'GET'}] ${endpoint}:`, error);
    throw error;
  }
}
