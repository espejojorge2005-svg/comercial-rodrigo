import { Injectable, Logger } from '@nestjs/common';
import { MockBillingDriver } from './drivers/mock-billing.driver.js';
import { NubefactBillingDriver } from './drivers/nubefact-billing.driver.js';
import {
  BillingDriverType,
  BillingIssueResult,
  IBillingDriver,
  IssueReceiptInput,
  IssueCreditNoteInput,
} from './billing.types.js';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private activeDriver: IBillingDriver;

  constructor(
    private readonly mockDriver: MockBillingDriver,
    private readonly nubefactDriver: NubefactBillingDriver,
  ) {
    const configuredDriver = (
      process.env.BILLING_DRIVER || 'MOCK'
    ).toUpperCase() as BillingDriverType;

    if (configuredDriver === 'NUBEFACT' && process.env.NUBEFACT_URL) {
      this.activeDriver = this.nubefactDriver;
      this.logger.log('🚀 Motor de Facturación inicializado con driver: NUBEFACT (Producción/Pruebas PSE)');
    } else {
      this.activeDriver = this.mockDriver;
      this.logger.log('🧪 Motor de Facturación inicializado con driver: MOCK (Simulación Fiscal Interna)');
    }
  }

  /**
   * Retorna el nombre del driver activo actualmente gobernado por BILLING_DRIVER
   */
  getActiveDriverName(): string {
    return this.activeDriver.driverName;
  }

  /**
   * Canaliza la emisión fiscal de Boleta o Factura a través del driver desacoplado
   */
  async issueReceipt(input: IssueReceiptInput): Promise<BillingIssueResult> {
    try {
      return await this.activeDriver.issueReceipt(input);
    } catch (err: any) {
      this.logger.error(
        `Error al emitir comprobante con driver ${this.activeDriver.driverName}: ${err.message}. Intentando fallback a MOCK...`,
      );
      // Fallback de resiliencia: si el driver real falla por red, simular para no bloquear la caja física
      return await this.mockDriver.issueReceipt(input);
    }
  }

  /**
   * Canaliza la emisión fiscal de Nota de Crédito Electrónica a través del driver desacoplado
   */
  async issueCreditNote(input: IssueCreditNoteInput): Promise<BillingIssueResult> {
    try {
      return await this.activeDriver.issueCreditNote(input);
    } catch (err: any) {
      this.logger.error(
        `Error al emitir Nota de Crédito con driver ${this.activeDriver.driverName}: ${err.message}. Intentando fallback a MOCK...`,
      );
      return await this.mockDriver.issueCreditNote(input);
    }
  }
}

