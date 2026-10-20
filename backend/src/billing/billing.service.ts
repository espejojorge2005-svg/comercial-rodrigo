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
    const hasNubefactCredentials = Boolean(process.env.NUBEFACT_URL && process.env.NUBEFACT_TOKEN);
    const configuredDriver = (
      process.env.BILLING_DRIVER || (hasNubefactCredentials ? 'NUBEFACT' : 'MOCK')
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
        `Error al emitir comprobante con driver ${this.activeDriver.driverName}: ${err.message}`,
      );

      // Si el entorno está configurado deliberadamente en modo MOCK, simular
      if (this.activeDriver.driverName === 'MOCK') {
        return await this.mockDriver.issueReceipt(input);
      }

      // 🛡️ REGLA TRIBUTARIA SUNAT:
      // En producción (NUBEFACT), ante corte de red o timeout NUNCA falsear aceptación con datos simulados.
      // Se retorna PENDING (Modo Contingencia SUNAT) para permitir completar la venta en caja sin bloquear al cliente
      // y posibilitar la retransmisión posterior al PSE.
      return {
        success: false,
        hash: '',
        qrString: '',
        emissionStatus: 'PENDING',
        message: `Falla de comunicación con PSE Nubefact: ${err.message}. Comprobante preservado en PENDING.`,
        rawResponse: { error: err.message },
      };
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
        `Error al emitir Nota de Crédito con driver ${this.activeDriver.driverName}: ${err.message}`,
      );

      if (this.activeDriver.driverName === 'MOCK') {
        return await this.mockDriver.issueCreditNote(input);
      }

      return {
        success: false,
        hash: '',
        qrString: '',
        emissionStatus: 'PENDING',
        message: `Falla de comunicación con PSE Nubefact: ${err.message}. Nota de Crédito preservada en PENDING.`,
        rawResponse: { error: err.message },
      };
    }
  }
}

