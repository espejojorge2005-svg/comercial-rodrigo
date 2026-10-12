import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { IBillingDriver, IssueReceiptInput, BillingIssueResult } from '../billing.types.js';

@Injectable()
export class MockBillingDriver implements IBillingDriver {
  readonly driverName = 'MOCK';
  private readonly logger = new Logger(MockBillingDriver.name);

  async issueReceipt(input: IssueReceiptInput): Promise<BillingIssueResult> {
    const {
      receiptType,
      series,
      correlativeNumber,
      totalAmount,
      igvAmount,
      customerDocument,
      companyRuc = '10458923011',
      createdAt = new Date(),
    } = input;

    // 1. Determinar código de tipo de comprobante según catálogo SUNAT #01
    // 01: Factura Electrónica
    // 03: Boleta de Venta Electrónica
    // 00: Nota Interna
    const docTypeCode =
      receiptType === 'FACTURA' ? '01' : receiptType === 'BOLETA' ? '03' : '00';

    // 2. Determinar tipo de documento del cliente según catálogo SUNAT #06
    // 6: RUC (11 dígitos)
    // 1: DNI (8 dígitos)
    // -: Sin documento / Clientes Varios
    let customerDocType = '-';
    const cleanDoc = (customerDocument || '').trim();
    if (cleanDoc.length === 11) {
      customerDocType = '6';
    } else if (cleanDoc.length === 8) {
      customerDocType = '1';
    }

    const customerDocNum = cleanDoc || '-';
    const dateFormatted = createdAt.toISOString().split('T')[0];
    const paddedCorrelative = String(correlativeNumber).padStart(8, '0');
    const igvFormatted = Number(igvAmount).toFixed(2);
    const totalFormatted = Number(totalAmount).toFixed(2);

    // 3. Generar Código Hash Oficial Simulado (SHA-256 Base64 digest de 28 caracteres)
    const rawContentToSign = `${companyRuc}|${docTypeCode}|${series}|${paddedCorrelative}|${totalFormatted}|${dateFormatted}|${Date.now()}`;
    const hash = crypto
      .createHash('sha256')
      .update(rawContentToSign)
      .digest('base64')
      .substring(0, 28);

    // 4. Construir cadena oficial de código QR según estándar SUNAT
    // Estructura: RUC | TIPO_COMPROBANTE | SERIE | NUMERO | IGV | TOTAL | FECHA | TIPO_DOC_CLIENTE | NUM_DOC_CLIENTE | HASH
    const qrString = `${companyRuc}|${docTypeCode}|${series}|${paddedCorrelative}|${igvFormatted}|${totalFormatted}|${dateFormatted}|${customerDocType}|${customerDocNum}|${hash}|`;

    this.logger.log(
      `[MOCK PSE] Comprobante fiscal simulado emitido: ${series}-${paddedCorrelative} (Hash: ${hash})`,
    );

    return {
      success: true,
      hash,
      qrString,
      emissionStatus: 'SIMULATED',
      message: `Comprobante ${receiptType} ${series}-${paddedCorrelative} generado exitosamente en modo simulación fiscal`,
      externalId: `SIM-${Date.now()}-${series}-${paddedCorrelative}`,
      rawResponse: {
        driver: 'MOCK',
        tipo_comprobante: docTypeCode,
        serie: series,
        numero: correlativeNumber,
        sunat_status: 'ACEPTADO_SIMULADO',
        digest_value: hash,
        enlace_del_pdf: null,
        enlace_del_xml: null,
        enlace_del_cdr: null,
      },
    };
  }
}
