import { Injectable, Logger } from '@nestjs/common';
import { IBillingDriver, IssueReceiptInput, BillingIssueResult } from '../billing.types.js';

@Injectable()
export class NubefactBillingDriver implements IBillingDriver {
  readonly driverName = 'NUBEFACT';
  private readonly logger = new Logger(NubefactBillingDriver.name);

  async issueReceipt(input: IssueReceiptInput): Promise<BillingIssueResult> {
    const apiUrl = process.env.NUBEFACT_URL;
    const apiToken = process.env.NUBEFACT_TOKEN;

    if (!apiUrl || !apiToken) {
      this.logger.warn(
        'Credenciales de Nubefact (NUBEFACT_URL / NUBEFACT_TOKEN) no encontradas en .env. Se usará simulación.',
      );
      throw new Error(
        'El driver NUBEFACT requiere configurar NUBEFACT_URL y NUBEFACT_TOKEN en las variables de entorno.',
      );
    }

    const {
      receiptType,
      series,
      correlativeNumber,
      totalAmount,
      taxableBase,
      igvAmount,
      customerName,
      customerDocument,
      customerAddress,
      items,
      createdAt = new Date(),
    } = input;

    // Catálogo Nubefact: 1 = Factura, 2 = Boleta
    const tipoDeComprobante = receiptType === 'FACTURA' ? 1 : 2;

    let clienteTipoDoc = '-';
    const cleanDoc = (customerDocument || '').trim();
    if (cleanDoc.length === 11) {
      clienteTipoDoc = '6';
    } else if (cleanDoc.length === 8) {
      clienteTipoDoc = '1';
    }

    // Formatear fecha a DD-MM-YYYY
    const d = createdAt.getDate().toString().padStart(2, '0');
    const m = (createdAt.getMonth() + 1).toString().padStart(2, '0');
    const y = createdAt.getFullYear();
    const fechaEmision = `${d}-${m}-${y}`;

    // Estructurar JSON estándar para el API de Nubefact / ApisPerú
    const payload = {
      operacion: 'generar_comprobante',
      tipo_de_comprobante: tipoDeComprobante,
      serie: series,
      numero: correlativeNumber,
      sunat_transaction: 1,
      cliente_tipo_de_documento: clienteTipoDoc,
      cliente_numero_de_documento: cleanDoc || '-',
      cliente_denominacion: customerName || 'CLIENTES VARIOS',
      cliente_direccion: customerAddress || '-',
      cliente_email: '',
      fecha_de_emision: fechaEmision,
      moneda: 1, // Soles
      porcentaje_de_igv: 18.0,
      total_gravada: Number(taxableBase.toFixed(2)),
      total_igv: Number(igvAmount.toFixed(2)),
      total: Number(totalAmount.toFixed(2)),
      detraccion: false,
      items: items.map((item) => {
        const itemSubtotal = Number(item.subtotal.toFixed(2));
        const itemValorUnitario = Number((itemSubtotal / 1.18 / item.quantity).toFixed(4));
        const itemValorTotal = Number((itemSubtotal / 1.18).toFixed(2));
        const itemIgv = Number((itemSubtotal - itemValorTotal).toFixed(2));

        return {
          unidad_de_medida: 'NIU',
          codigo: '',
          descripcion: item.name,
          cantidad: item.quantity,
          valor_unitario: itemValorUnitario,
          precio_unitario: Number(item.unitPrice.toFixed(2)),
          subtotal: itemValorTotal,
          tipo_de_igv: 1, // Gravado - Operación Onerosa
          igv: itemIgv,
          total: itemSubtotal,
          anticipo_regularizacion: false,
        };
      }),
    };

    this.logger.log(`Enviando comprobante a Nubefact (${apiUrl}): ${series}-${correlativeNumber}`);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify(payload),
    });

    const data: any = await response.json();

    if (!response.ok || data.errors) {
      const errorMsg = data.errors || data.message || 'Error en respuesta de Nubefact';
      this.logger.error(`Error de emisión en Nubefact: ${errorMsg}`);
      return {
        success: false,
        hash: '',
        qrString: '',
        emissionStatus: 'REJECTED',
        message: `Rechazado por PSE Nubefact: ${errorMsg}`,
        rawResponse: data,
      };
    }

    return {
      success: true,
      hash: data.codigo_hash || data.hash || '',
      qrString: data.cadena_para_codigo_qr || '',
      emissionStatus: 'ACCEPTED',
      message: 'Comprobante aceptado por SUNAT a través de Nubefact',
      externalId: data.enlace || `${series}-${correlativeNumber}`,
      rawResponse: data,
    };
  }
}
