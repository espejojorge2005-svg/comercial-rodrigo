import { Injectable, Logger } from '@nestjs/common';
import {
  IBillingDriver,
  IssueReceiptInput,
  IssueCreditNoteInput,
  BillingIssueResult,
} from '../billing.types.js';

/**
 * Formatea una fecha a DD-MM-YYYY usando estrictamente la zona horaria de Perú (America/Lima / UTC-5)
 * evitando que a partir de las 7:00 PM las ventas salgan con fecha del día siguiente.
 */
function formatPeruDDMMYYYY(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date);

  const day = parts.find((p) => p.type === 'day')?.value || '01';
  const month = parts.find((p) => p.type === 'month')?.value || '01';
  const year = parts.find((p) => p.type === 'year')?.value || '2026';

  return `${day}-${month}-${year}`;
}

/**
 * Mapea el tipo de unidad interna (Catálogo 03 SUNAT) a la unidad oficial de Nubefact
 */
function mapUnitTypeToSunat(unitType?: string): string {
  if (!unitType) return 'NIU';
  const u = unitType.trim().toUpperCase();
  switch (u) {
    case 'UNIT':
    case 'NIU':
      return 'NIU'; // Unidad
    case 'KG':
    case 'KGM':
    case 'KILOGRAMO':
      return 'KGM'; // Kilogramo
    case 'LT':
    case 'LTR':
    case 'LITRO':
      return 'LTR'; // Litro
    case 'MTR':
    case 'METRO':
      return 'MTR'; // Metro
    case 'SA':
    case 'SACO':
      return 'SA'; // Saco
    case 'BX':
    case 'CAJA':
      return 'BX'; // Caja
    case 'PK':
    case 'PAQUETE':
      return 'PK'; // Paquete
    default:
      return 'NIU';
  }
}

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
      customerEmail,
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

    // 🕒 Zona horaria oficial de Perú (America/Lima / UTC-5)
    const fechaEmision = formatPeruDDMMYYYY(createdAt);

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
      cliente_email: (customerEmail || '').trim(),
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
          unidad_de_medida: mapUnitTypeToSunat(item.unitType),
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

  async issueCreditNote(input: IssueCreditNoteInput): Promise<BillingIssueResult> {
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
      creditNoteSeries,
      creditNoteCorrelative,
      modifiedDocTypeCode,
      modifiedSeries,
      modifiedCorrelative,
      reasonCode,
      reasonDescription,
      totalAmount,
      taxableBase,
      igvAmount,
      customerName,
      customerDocument,
      customerAddress,
      customerEmail,
      items,
      createdAt = new Date(),
    } = input;

    // Catálogo Nubefact: 3 = Nota de Crédito
    const tipoDeComprobante = 3;

    let clienteTipoDoc = '-';
    const cleanDoc = (customerDocument || '').trim();
    if (cleanDoc.length === 11) {
      clienteTipoDoc = '6';
    } else if (cleanDoc.length === 8) {
      clienteTipoDoc = '1';
    }

    // 🕒 Zona horaria oficial de Perú (America/Lima / UTC-5)
    const fechaEmision = formatPeruDDMMYYYY(createdAt);

    // Nubefact: documento_que_se_modifica_tipo: 1 = Factura, 2 = Boleta
    const docModificaTipo = modifiedDocTypeCode === '01' ? 1 : 2;
    const tipoNotaCreditoNum = parseInt(reasonCode, 10) || 1;

    const payload = {
      operacion: 'generar_comprobante',
      tipo_de_comprobante: tipoDeComprobante,
      serie: creditNoteSeries,
      numero: creditNoteCorrelative,
      sunat_transaction: 1,
      cliente_tipo_de_documento: clienteTipoDoc,
      cliente_numero_de_documento: cleanDoc || '-',
      cliente_denominacion: customerName || 'CLIENTES VARIOS',
      cliente_direccion: customerAddress || '-',
      cliente_email: (customerEmail || '').trim(),
      fecha_de_emision: fechaEmision,
      moneda: 1, // Soles
      porcentaje_de_igv: 18.0,
      total_gravada: Number(taxableBase.toFixed(2)),
      total_igv: Number(igvAmount.toFixed(2)),
      total: Number(totalAmount.toFixed(2)),
      documento_que_se_modifica_tipo: docModificaTipo,
      documento_que_se_modifica_serie: modifiedSeries,
      documento_que_se_modifica_numero: modifiedCorrelative,
      tipo_de_nota_de_credito: tipoNotaCreditoNum,
      motivo: reasonDescription || 'ANULACION DE LA OPERACION',
      detraccion: false,
      items: items.map((item: any) => {
        const itemSubtotal = Number(item.subtotal.toFixed(2));
        const itemValorUnitario = Number((itemSubtotal / 1.18 / item.quantity).toFixed(4));
        const itemValorTotal = Number((itemSubtotal / 1.18).toFixed(2));
        const itemIgv = Number((itemSubtotal - itemValorTotal).toFixed(2));

        return {
          unidad_de_medida: mapUnitTypeToSunat(item.unitType),
          codigo: '',
          descripcion: item.name,
          cantidad: item.quantity,
          valor_unitario: itemValorUnitario,
          precio_unitario: Number(item.unitPrice.toFixed(2)),
          subtotal: itemValorTotal,
          tipo_de_igv: 1,
          igv: itemIgv,
          total: itemSubtotal,
          anticipo_regularizacion: false,
        };
      }),
    };

    this.logger.log(
      `Enviando Nota de Crédito a Nubefact (${apiUrl}): ${creditNoteSeries}-${creditNoteCorrelative} (Modifica ${modifiedSeries}-${modifiedCorrelative})`,
    );

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
      this.logger.error(`Error de emisión en Nubefact para Nota de Crédito: ${errorMsg}`);
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
      message: 'Nota de Crédito aceptada por SUNAT a través de Nubefact',
      externalId: data.enlace || `${creditNoteSeries}-${creditNoteCorrelative}`,
      rawResponse: data,
    };
  }
}

