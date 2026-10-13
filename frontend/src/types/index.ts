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

export type ReceiptType =
  | 'NOTA_VENTA'
  | 'BOLETA'
  | 'FACTURA'
  | 'NOTA_CREDITO_BOLETA'
  | 'NOTA_CREDITO_FACTURA';

export type EmissionStatus = 'SIMULATED' | 'ACCEPTED' | 'PENDING' | 'REJECTED';

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
  expirationDate?: string | null; // Fecha de vencimiento opcional (ej: lácteos, embutidos)
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

export interface CreditNote {
  id: string;
  series: string;
  correlativeNumber: number;
  fullNumber: string;
  reasonCode: string;
  reasonDescription: string;
  customReason?: string | null;
  taxableBase: number;
  igvAmount: number;
  totalAmount: number;
  hash?: string | null;
  qrString?: string | null;
  emissionStatus?: EmissionStatus | null;
  createdAt: string;
}

export interface SaleDetail {
  id: string;
  productId: string;
  productName?: string;
  product?: {
    id: string;
    name: string;
    barcode?: string | null;
    unitType?: UnitType;
  };
  quantity: number;
  unitPrice: number;
  subtotal: number;
  costPriceSnapshot?: number;
}

export interface Sale {
  id: string;
  saleNumber: number;
  receiptType: ReceiptType;
  series: string;
  correlativeNumber: number;
  fullReceiptNumber?: string;
  isFiscal: boolean;
  taxableBase: number;
  igvAmount: number;
  customerAddress?: string | null;
  customerEmail?: string | null;
  hash?: string | null;
  qrString?: string | null;
  emissionStatus?: EmissionStatus | null;
  createdAt: string;
  customerName?: string | null;
  customerDocument?: string | null;
  paymentMethod: PaymentMethod;
  cashPaid: number;
  digitalPaid: number;
  totalAmount: number;
  changeAmount: number;
  isVoided: boolean;
  voidedReason?: string | null;
  creditNote?: CreditNote | null;
  user?: {
    id: string;
    name: string;
    username: string;
  };
  cashShift?: {
    id: string;
    cashRegister?: {
      id: string;
      name: string;
      identifier: string;
    };
  };
  items: SaleDetail[];
  isOffline?: boolean;
}

export interface TaxBookRecord {
  itemNumber: number;
  id: string;
  createdAt: string;
  issueDate: string;
  receiptType: ReceiptType;
  sunatDocTypeCode: string; // "01" | "03"
  receiptTypeName: string;
  series: string;
  correlativeNumber: number;
  formattedCorrelative: string;
  fullReceiptNumber: string;
  customerDocType: string; // "1" (DNI), "6" (RUC), "0" (Sin Doc)
  customerDocument: string;
  customerName: string;
  customerAddress?: string;
  taxableBase: number;
  igvAmount: number;
  totalAmount: number;
  emissionStatus: string;
  cashRegister: string;
}

export interface TaxBookResponse {
  period: {
    startDate?: string | null;
    endDate?: string | null;
  };
  summary: {
    totalFiscalSales: number;
    invoiceCount: number;
    receiptCount: number;
    totalTaxableBase: number;
    totalIgv: number;
    totalAmount: number;
  };
  records: TaxBookRecord[];
}

export interface ManagementReportSummary {
  totalGrossRevenue: number;
  totalCogs: number;
  grossProfit: number;
  grossMarginPct: number;
  totalExpenses: number;
  totalIncomes: number;
  netProfit: number;
  netMarginPct: number;
  salesCount: number;
  totalUnitsSold: number;
  cashPaidTotal: number;
  digitalPaidTotal: number;
  theoreticalDrawerCash: number;
  paymentMethods: Record<string, number>;
  receiptTypeSummary: {
    notaVenta: { count: number; total: number; profit: number; sharePct: number };
    boleta: { count: number; total: number; profit: number; sharePct: number };
    factura: { count: number; total: number; profit: number; sharePct: number };
  };
}

export interface ManagementReportResponse {
  period: {
    startDate?: string | null;
    endDate?: string | null;
  };
  summary: ManagementReportSummary;
  salesDetail: any[];
  cashMovementsDetail: any[];
}
