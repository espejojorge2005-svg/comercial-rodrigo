import { create } from 'zustand';
import type { User } from '../types/index.js';
import { apiRequest, registerUnauthorizedHandler } from '../api/client.js';
import { useCartStore } from './useCartStore.js';
import { useShiftStore } from './useShiftStore.js';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  verifyAdminPin: (pin: string) => Promise<{ valid: boolean; adminName?: string; adminId?: string }>;
  initAuth: () => Promise<void>;
}

function clearTransientSessionStores(): void {
  useCartStore.getState().clearCart();
  useShiftStore.getState().resetShiftState();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cr:auth-changed'));
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: localStorage.getItem('auth_token'),
  isLoading: false,
  error: null,

  login: async (username: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const prevUserId = get().user?.id;
      const data = await apiRequest<{ access_token: string; user: User }>('/auth/login', {
        method: 'POST',
        data: { username, password },
      });

      if (prevUserId !== data.user.id) {
        clearTransientSessionStores();
      }

      localStorage.setItem('auth_token', data.access_token);
      localStorage.setItem('auth_user', JSON.stringify(data.user));

      set({
        token: data.access_token,
        user: data.user,
        isLoading: false,
        error: null,
      });

      return true;
    } catch (err: any) {
      set({
        isLoading: false,
        error: err.message || 'Error al iniciar sesión',
      });
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    clearTransientSessionStores();
    set({ user: null, token: null, error: null });
  },

  verifyAdminPin: async (pin: string) => {
    try {
      const res = await apiRequest<{ valid: boolean; adminName: string; adminId: string }>(
        '/auth/verify-pin',
        {
          method: 'POST',
          data: { pin },
        },
      );
      return res;
    } catch (err: any) {
      throw new Error(err.message || 'PIN de administrador inválido');
    }
  },

  initAuth: async () => {
    const token = localStorage.getItem('auth_token');
    const storedUser = localStorage.getItem('auth_user');

    if (!token) return;

    let parsedUser: User | null = null;
    if (storedUser) {
      try {
        parsedUser = JSON.parse(storedUser) as User;
        set({ user: parsedUser, token });
      } catch {
        // Fallback
      }
    }

    try {
      const user = await apiRequest<User>('/auth/profile');
      set({ user, token });
      localStorage.setItem('auth_user', JSON.stringify(user));
    } catch (err: any) {
      // Si se recargó la página (F5) sin internet o con caída temporal de red,
      // conservar la sesión local en caché para no bloquear el Punto de Venta Offline.
      const isOfflineFailure =
        (typeof navigator !== 'undefined' && !navigator.onLine) || Boolean(err?.isNetworkError);

      if (isOfflineFailure && parsedUser) {
        set({ user: parsedUser, token });
        return;
      }

      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      clearTransientSessionStores();
      set({ user: null, token: null });
    }
  },
}));

registerUnauthorizedHandler(() => {
  useAuthStore.getState().logout();
});
