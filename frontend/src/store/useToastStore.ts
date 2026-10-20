import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastState {
  toasts: ToastItem[];
  addToast: (message: string, type?: ToastType, duration?: number) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (message: string, type: ToastType = 'info', duration = 3500) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newToast: ToastItem = { id, message, type, duration };

    set((state) => ({
      // Mantener máximo 5 toasts simultáneos para no saturar la pantalla
      toasts: [...state.toasts.slice(-4), newToast],
    }));

    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, duration);
    }

    return id;
  },

  removeToast: (id: string) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  clearToasts: () => {
    set({ toasts: [] });
  },
}));

// Helpers de acceso directo para usar en cualquier archivo TS/TSX
export const toast = {
  success: (msg: string, duration?: number) =>
    useToastStore.getState().addToast(msg, 'success', duration),
  error: (msg: string, duration?: number) =>
    useToastStore.getState().addToast(msg, 'error', duration),
  warning: (msg: string, duration?: number) =>
    useToastStore.getState().addToast(msg, 'warning', duration),
  info: (msg: string, duration?: number) =>
    useToastStore.getState().addToast(msg, 'info', duration),
};
