export type BillingDriverType = 'MOCK' | 'NUBEFACT';

export interface IssueReceiptInput {
  receiptType: 'BOLETA' | 'FACTURA' | 'NOTA_VENTA';
  series: string;
  correlativeNumber: number;
  totalAmount: number;
  taxableBase: number;
  igvAmount: number;
  customerName: string;
  customerDocument?: string | null;
  customerAddress?: string | null;
  paymentMethod: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
  companyRuc?: string;
  createdAt?: Date;
}

export interface BillingIssueResult {
  success: boolean;
  hash: string;
  qrString: string;
  emissionStatus: 'SIMULATED' | 'ACCEPTED' | 'PENDING' | 'REJECTED';
  message: string;
  externalId?: string;
  rawResponse?: any;
}

export interface IBillingDriver {
  readonly driverName: string;
  issueReceipt(input: IssueReceiptInput): Promise<BillingIssueResult>;
}
