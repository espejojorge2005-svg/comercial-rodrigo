import { create } from 'zustand';
import type { CartItem, Product } from '../types/index.js';
import { isDiscreteUnitType } from '../lib/units.js';
import { toast } from './useToastStore.js';

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

  addItem: (product: Product, quantity?: number) => {
    const { items, isGlobalWholesale } = get();
    const existingIndex = items.findIndex((i) => i.product.id === product.id);
    const isDiscrete = isDiscreteUnitType(product.unitType);

    if (product.currentStock <= 0) {
      toast.warning(`"${product.name}" se encuentra agotado en almacén.`);
      return false;
    }

    const currentQty = existingIndex >= 0 ? items[existingIndex].quantity : 0;
    const remainingStock = Number((product.currentStock - currentQty).toFixed(3));

    if (remainingStock <= 0) {
      toast.warning(
        `Stock insuficiente para "${product.name}". Disponible en almacén: ${product.currentStock}`,
      );
      return false;
    }

    // Para productos a granel (KG / LT), si queda menos de 1 unidad (ej. 0.450 kg) y no se indicó cantidad, agregar el saldo disponible
    const requestedQty =
      quantity !== undefined
        ? quantity
        : !isDiscrete && remainingStock < 1
          ? remainingStock
          : 1;

    const normalizedAddQty = isDiscrete
      ? Math.round(requestedQty)
      : Number(requestedQty.toFixed(3));

    if (normalizedAddQty <= 0) {
      return false;
    }

    const newQty = isDiscrete
      ? Math.round(currentQty + normalizedAddQty)
      : Number((currentQty + normalizedAddQty).toFixed(3));

    // Validar disponibilidad de stock
    if (newQty > Number(product.currentStock.toFixed(3))) {
      toast.warning(
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
    if (!Number.isFinite(quantity) || quantity <= 0) {
      get().removeItem(productId);
      return;
    }

    const item = items.find((i) => i.product.id === productId);
    if (!item) return;

    const isDiscrete = isDiscreteUnitType(item.product.unitType);
    const normalizedQty = isDiscrete
      ? Math.round(quantity)
      : Number(quantity.toFixed(3));

    if (normalizedQty <= 0) {
      get().removeItem(productId);
      return;
    }

    if (normalizedQty > Number(item.product.currentStock.toFixed(3))) {
      toast.warning(`Stock máximo disponible para "${item.product.name}": ${item.product.currentStock}`);
      return;
    }

    const canHaveWholesale = hasWholesalePrice(item.product);
    const minQty = item.product.wholesaleMinQty ? Number(item.product.wholesaleMinQty) : 3;
    const isWholesale = canHaveWholesale && (isGlobalWholesale || normalizedQty >= minQty);

    const unitPrice = isWholesale
      ? Number(item.product.wholesalePrice)
      : Number(item.product.retailPrice);

    const subtotal = Number((normalizedQty * unitPrice).toFixed(2));

    set({
      items: items.map((i) =>
        i.product.id === productId
          ? {
              ...i,
              quantity: normalizedQty,
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
          toast.info(`El producto "${i.product.name}" no tiene precio mayorista configurado.`);
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
    return Number(
      get()
        .items.reduce((acc, i) => acc + i.quantity, 0)
        .toFixed(3),
    );
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
