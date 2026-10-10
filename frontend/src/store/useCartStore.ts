import { create } from 'zustand';
import type { CartItem, Product } from '../types/index.js';

interface CartState {
  items: CartItem[];
  customerName: string;
  customerDocument: string;
  isGlobalWholesale: boolean;

  addItem: (product: Product, quantity?: number) => boolean;
  updateItemQty: (productId: string, quantity: number) => void;
  toggleItemWholesale: (productId: string) => void;
  toggleGlobalWholesale: () => void;
  removeItem: (productId: string) => void;
  clearCart: () => void;
  setCustomer: (name: string, doc: string) => void;

  getTotalAmount: () => number;
  getTotalItemsCount: () => number;
  getTotalWholesaleSavings: () => number;
}

const hasWholesalePrice = (p: Product) =>
  p.wholesalePrice !== null &&
  p.wholesalePrice !== undefined &&
  Number(p.wholesalePrice) > 0;

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  customerName: 'Cliente Varios',
  customerDocument: '',
  isGlobalWholesale: false,

  addItem: (product: Product, quantity = 1) => {
    const { items, isGlobalWholesale } = get();
    const existingIndex = items.findIndex((i) => i.product.id === product.id);

    const currentQty = existingIndex >= 0 ? items[existingIndex].quantity : 0;
    const newQty = currentQty + quantity;

    // Validar disponibilidad de stock
    if (newQty > product.currentStock) {
      alert(
        `Stock insuficiente para "${product.name}". Disponible en almacén: ${product.currentStock}`,
      );
      return false;
    }

    // Regla de Precio Mayorista:
    // Solo si el producto tiene precio mayorista configurado
    const canHaveWholesale = hasWholesalePrice(product);
    const minQty = product.wholesaleMinQty ? Number(product.wholesaleMinQty) : 3;
    const isWholesale = canHaveWholesale && (isGlobalWholesale || newQty >= minQty);

    const unitPrice = isWholesale ? Number(product.wholesalePrice) : Number(product.retailPrice);
    const subtotal = Number((newQty * unitPrice).toFixed(2));

    if (existingIndex >= 0) {
      const updated = [...items];
      updated[existingIndex] = {
        product,
        quantity: newQty,
        unitPrice,
        isWholesaleApplied: isWholesale,
        subtotal,
      };
      set({ items: updated });
    } else {
      set({
        items: [
          ...items,
          {
            product,
            quantity: newQty,
            unitPrice,
            isWholesaleApplied: isWholesale,
            subtotal,
          },
        ],
      });
    }

    return true;
  },

  updateItemQty: (productId: string, quantity: number) => {
    const { items, isGlobalWholesale } = get();
    if (quantity <= 0) {
      get().removeItem(productId);
      return;
    }

    const item = items.find((i) => i.product.id === productId);
    if (!item) return;

    if (quantity > item.product.currentStock) {
      alert(`Stock máximo disponible: ${item.product.currentStock}`);
      return;
    }

    const canHaveWholesale = hasWholesalePrice(item.product);
    const minQty = item.product.wholesaleMinQty ? Number(item.product.wholesaleMinQty) : 3;
    const isWholesale = canHaveWholesale && (isGlobalWholesale || quantity >= minQty);

    const unitPrice = isWholesale
      ? Number(item.product.wholesalePrice)
      : Number(item.product.retailPrice);

    const subtotal = Number((quantity * unitPrice).toFixed(2));

    set({
      items: items.map((i) =>
        i.product.id === productId
          ? {
              ...i,
              quantity,
              unitPrice,
              isWholesaleApplied: isWholesale,
              subtotal,
            }
          : i,
      ),
    });
  },

  toggleItemWholesale: (productId: string) => {
    const { items } = get();
    set({
      items: items.map((i) => {
        if (i.product.id !== productId) return i;

        if (!hasWholesalePrice(i.product)) {
          alert(`El producto "${i.product.name}" no tiene precio mayorista configurado.`);
          return i;
        }

        const newWholesale = !i.isWholesaleApplied;
        const unitPrice = newWholesale
          ? Number(i.product.wholesalePrice)
          : Number(i.product.retailPrice);

        return {
          ...i,
          isWholesaleApplied: newWholesale,
          unitPrice,
          subtotal: Number((i.quantity * unitPrice).toFixed(2)),
        };
      }),
    });
  },

  toggleGlobalWholesale: () => {
    const { isGlobalWholesale, items } = get();
    const nextState = !isGlobalWholesale;

    const updated = items.map((i) => {
      const canHaveWholesale = hasWholesalePrice(i.product);
      const minQty = i.product.wholesaleMinQty ? Number(i.product.wholesaleMinQty) : 3;
      const isWholesale = canHaveWholesale && (nextState || i.quantity >= minQty);

      const unitPrice = isWholesale
        ? Number(i.product.wholesalePrice)
        : Number(i.product.retailPrice);

      return {
        ...i,
        isWholesaleApplied: isWholesale,
        unitPrice,
        subtotal: Number((i.quantity * unitPrice).toFixed(2)),
      };
    });

    set({ isGlobalWholesale: nextState, items: updated });
  },

  removeItem: (productId: string) => {
    set({ items: get().items.filter((i) => i.product.id !== productId) });
  },

  clearCart: () => {
    set({
      items: [],
      customerName: 'Cliente Varios',
      customerDocument: '',
      isGlobalWholesale: false,
    });
  },

  setCustomer: (customerName: string, customerDocument: string) => {
    set({ customerName, customerDocument });
  },

  getTotalAmount: () => {
    return Number(
      get()
        .items.reduce((acc, i) => acc + i.subtotal, 0)
        .toFixed(2),
    );
  },

  getTotalItemsCount: () => {
    return get().items.reduce((acc, i) => acc + i.quantity, 0);
  },

  getTotalWholesaleSavings: () => {
    return Number(
      get()
        .items.reduce((acc, i) => {
          if (i.isWholesaleApplied) {
            const normalSubtotal = i.quantity * Number(i.product.retailPrice);
            return acc + (normalSubtotal - i.subtotal);
          }
          return acc;
        }, 0)
        .toFixed(2),
    );
  },
}));
