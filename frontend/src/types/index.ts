export type Role = 'ADMIN' | 'CAJERO';

export type UnitType = 'SA' | 'BX' | 'PK' | 'NIU' | 'KG' | 'LT' | 'UNIT';

export type ShiftStatus = 'OPEN' | 'CLOSED';

export type PaymentMethod = 'CASH' | 'TRANSFER' | 'CARD' | 'MIXED';

export type MovementType =
  | 'PURCHASE'
  | 'SALE'
  | 'RETURN_SALE'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT';

export type CashMovementType = 'INCOME' | 'EXPENSE';

export interface User {
  id: string;
  name: string;
  username: string;
  role: Role;
  isActive: boolean;
}

export interface CashRegister {
  id: string;
  name: string;
  identifier: string;
  isActive: boolean;
  isAvailable: boolean;
  activeShift?: {
    id: string;
    openedAt: string;
    initialBalance: number;
    user: {
      id: string;
      name: string;
      username: string;
      role: Role;
    };
  } | null;
}

export interface CashMovement {
  id: string;
  cashShiftId: string;
  type: CashMovementType;
  amount: number;
  reason: string;
  createdAt: string;
}

export interface CashShift {
  id: string;
  cashRegisterId: string;
  userId: string;
  openedAt: string;
  closedAt?: string | null;
  initialBalance: number;
  expectedBalance?: number | null;
  actualBalance?: number | null;
  difference?: number | null;
  status: ShiftStatus;
  notes?: string | null;
  cashRegister?: CashRegister;
  user?: User;
  cashMovements?: CashMovement[];
  metrics?: {
    totalSales: number;
    cashSales: number;
    digitalSales: number;
    salesCount: number;
    totalIncomeMovements: number;
    totalExpenseMovements: number;
  };
}

export interface Category {
  id: string;
  name: string;
  description?: string | null;
}

export interface Product {
  id: string;
  barcode?: string | null;
  name: string;
  categoryId: string;
  category?: Category;
  unitType: UnitType;
  costPrice?: number; // Solo visible para ADMIN
  retailPrice: number; // Precio al por menor
  wholesalePrice?: number | null; // Precio al por mayor (Opcional)
  wholesaleMinQty?: number | null; // Cantidad mínima para precio mayorista (Opcional)
  currentStock: number;
  minStock: number;
  isActive: boolean;
  marginRetailPercent?: number;
  marginWholesalePercent?: number;
}

export interface KardexMovement {
  id: string;
  productId: string;
  productName: string;
  barcode?: string | null;
  unitType: UnitType;
  movementType: MovementType;
  quantity: number;
  previousStock: number;
  newStock: number;
  unitCost: number;
  referenceId?: string | null;
  reason: string;
  userName: string;
  createdAt: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  unitPrice: number;
  isWholesaleApplied: boolean;
  subtotal: number;
}

export interface StoreConfig {
  id: string;
  name: string;
  subtitle: string;
  ruc: string;
  phone: string;
  address: string;
  footerText: string;
  updatedAt?: string;
}
