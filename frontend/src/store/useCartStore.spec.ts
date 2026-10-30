import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCartStore } from './useCartStore.js';
import type { Product } from '../types/index.js';

describe('useCartStore - Lógica Financiera de Punto de Venta', () => {
  beforeEach(() => {
    // Resetear estado del carrito antes de cada prueba
    useCartStore.getState().clearCart();
    globalThis.alert = vi.fn();
  });

  const mockProduct: Product = {
    id: 'prod-1',
    barcode: '7751234567890',
    name: 'Aceite Primor 1L',
    categoryId: 'cat-1',
    category: { id: 'cat-1', name: 'Abarrotes' },
    unitType: 'NIU',
    retailPrice: 10.0,
    wholesalePrice: 8.5,
    wholesaleMinQty: 6,
    currentStock: 20,
    minStock: 2,
    isActive: true,
  };

  it('debe agregar un producto con precio menorista cuando la cantidad es inferior al mínimo mayorista', () => {
    const store = useCartStore.getState();
    const success = store.addItem(mockProduct, 2);

    expect(success).toBe(true);
    const state = useCartStore.getState();
    expect(state.items).toHaveLength(1);
    expect(state.items[0].quantity).toBe(2);
    expect(state.items[0].unitPrice).toBe(10.0);
    expect(state.items[0].isWholesaleApplied).toBe(false);
    expect(state.items[0].subtotal).toBe(20.0);
    expect(state.getTotalAmount()).toBe(20.0);
  });

  it('debe aplicar automáticamente precio mayorista cuando la cantidad alcanza o supera wholesaleMinQty', () => {
    const store = useCartStore.getState();
    // Agregamos 6 unidades (wholesaleMinQty = 6)
    store.addItem(mockProduct, 6);

    const state = useCartStore.getState();
    expect(state.items[0].quantity).toBe(6);
    expect(state.items[0].isWholesaleApplied).toBe(true);
    expect(state.items[0].unitPrice).toBe(8.5);
    // 6 * 8.5 = 51.0
    expect(state.items[0].subtotal).toBe(51.0);
    expect(state.getTotalAmount()).toBe(51.0);
    // Ahorro mayorista: (10.0 - 8.5) * 6 = 9.0
    expect(state.getTotalWholesaleSavings()).toBe(9.0);
  });

  it('debe validar la disponibilidad de stock impidiendo agregar más de currentStock', () => {
    const store = useCartStore.getState();
    // Stock disponible es 20, intentamos agregar 25
    const success = store.addItem(mockProduct, 25);

    expect(success).toBe(false);
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('debe actualizar la cantidad correctamente y recalcular precio menor/mayor', () => {
    const store = useCartStore.getState();
    store.addItem(mockProduct, 2); // inicia con 2 a S/ 10.0 = S/ 20.0

    store.updateItemQty(mockProduct.id, 10); // sube a 10 (aplica mayorista S/ 8.5)
    let state = useCartStore.getState();
    expect(state.items[0].quantity).toBe(10);
    expect(state.items[0].unitPrice).toBe(8.5);
    expect(state.items[0].subtotal).toBe(85.0);

    store.updateItemQty(mockProduct.id, 1); // baja a 1 (retorna a menorista S/ 10.0)
    state = useCartStore.getState();
    expect(state.items[0].quantity).toBe(1);
    expect(state.items[0].unitPrice).toBe(10.0);
    expect(state.items[0].subtotal).toBe(10.0);
  });

  it('debe remover el ítem si la cantidad se actualiza a 0 o menos', () => {
    const store = useCartStore.getState();
    store.addItem(mockProduct, 2);
    expect(useCartStore.getState().items).toHaveLength(1);

    store.updateItemQty(mockProduct.id, 0);
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('debe limpiar todo el carrito con clearCart', () => {
    const store = useCartStore.getState();
    store.addItem(mockProduct, 3);
    store.clearCart();

    const state = useCartStore.getState();
    expect(state.items).toHaveLength(0);
    expect(state.getTotalAmount()).toBe(0);
    expect(state.getTotalItemsCount()).toBe(0);
  });

  it('debe permitir vender el saldo fraccionado menor a 1 en productos a granel (KG / LT)', () => {
    const bulkProduct: Product = {
      ...mockProduct,
      id: 'prod-bulk-1',
      name: 'Azúcar Rubia Granel',
      unitType: 'KG',
      retailPrice: 4.0,
      wholesalePrice: null,
      wholesaleMinQty: null,
      currentStock: 0.45,
    };

    const store = useCartStore.getState();
    const added = store.addItem(bulkProduct); // sin cantidad explícita -> agrega los 0.45 kg restantes
    expect(added).toBe(true);

    const state = useCartStore.getState();
    expect(state.items).toHaveLength(1);
    expect(state.items[0].quantity).toBe(0.45);
    expect(state.items[0].subtotal).toBe(1.8);
  });
});
