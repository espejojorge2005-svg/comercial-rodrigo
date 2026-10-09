import { create } from 'zustand';
import type { User } from '../types/index.js';
import { apiRequest } from '../api/client.js';

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

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('auth_token'),
  isLoading: false,
  error: null,

  login: async (username: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiRequest<{ access_token: string; user: User }>('/auth/login', {
        method: 'POST',
        data: { username, password },
      });

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

    if (storedUser) {
      try {
        set({ user: JSON.parse(storedUser) });
      } catch {
        // Fallback
      }
    }

    try {
      const user = await apiRequest<User>('/auth/profile');
      set({ user, token });
      localStorage.setItem('auth_user', JSON.stringify(user));
    } catch {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      set({ user: null, token: null });
    }
  },
}));
