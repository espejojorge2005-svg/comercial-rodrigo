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
  customerEmail?: string | null;
  paymentMethod: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    unitType?: string;
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
  pdfUrl?: string | null;
  xmlUrl?: string | null;
  cdrUrl?: string | null;
  rawResponse?: any;
}

export interface IssueCreditNoteInput {
  saleId: string;
  receiptType: 'BOLETA' | 'FACTURA';
  creditNoteSeries: string;
  creditNoteCorrelative: number;
  modifiedReceiptType: 'BOLETA' | 'FACTURA';
  modifiedDocTypeCode: '01' | '03'; // 01: Factura, 03: Boleta
  modifiedSeries: string;
  modifiedCorrelative: number;
  modifiedFullNumber: string;
  reasonCode: string; // "01", "02", "06", etc. (Catálogo 09 SUNAT)
  reasonDescription: string;
  customReason?: string;
  totalAmount: number;
  taxableBase: number;
  igvAmount: number;
  customerName: string;
  customerDocument?: string | null;
  customerAddress?: string | null;
  customerEmail?: string | null;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    unitType?: string;
  }>;
  companyRuc?: string;
  createdAt?: Date;
}

export interface IBillingDriver {
  readonly driverName: string;
  issueReceipt(input: IssueReceiptInput): Promise<BillingIssueResult>;
  issueCreditNote(input: IssueCreditNoteInput): Promise<BillingIssueResult>;
}

