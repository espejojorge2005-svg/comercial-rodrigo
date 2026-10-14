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
 * Mapeo Oficial Catálogo 03 SUNAT - Códigos de Unidades de Medida
 * Siempre garantiza retornar un código válido de SUNAT.
 * Si la unidad es desconocida, errónea o vacía, retorna por defecto 'NIU' (Unidades)
 * para evitar que SUNAT marque la factura o boleta con estado OBSERVADO.
 */
export const SUNAT_UNIT_MAP: Record<string, string> = {
  // Unidades / Piezas
  NIU: 'NIU',
  UNIT: 'NIU',
  UNI: 'NIU',
  UNIDAD: 'NIU',
  UNIDADES: 'NIU',
  UND: 'NIU',
  PZA: 'NIU',
  PIEZA: 'NIU',
  PIEZAS: 'NIU',

  // Peso (Kilogramos, Gramos)
  KGM: 'KGM',
  KG: 'KGM',
  KGS: 'KGM',
  KILO: 'KGM',
  KILOGRAMO: 'KGM',
  KILOGRAMOS: 'KGM',
  GRM: 'GRM',
  GR: 'GRM',
  GRAMO: 'GRM',
  GRAMOS: 'GRM',

  // Volumen / Líquidos (Litros, Mililitros, Galones)
  LTR: 'LTR',
  LT: 'LTR',
  LTS: 'LTR',
  LITRO: 'LTR',
  LITROS: 'LTR',
  L: 'LTR',
  MLT: 'MLT',
  ML: 'MLT',
  MILILITRO: 'MLT',
  MILILITROS: 'MLT',
  GLI: 'GLI',
  GLL: 'GLI',
  GALON: 'GLI',
  GALONES: 'GLI',

  // Empaques y Presentaciones (Sacos, Cajas, Paquetes, Bolsas, Latas, Botellas, Baldes)
  SA: 'SA',
  SACO: 'SA',
  SACOS: 'SA',
  COSTAL: 'SA',
  COSTALES: 'SA',
  BX: 'BX',
  BOX: 'BX',
  CAJA: 'BX',
  CAJAS: 'BX',
  CJ: 'BX',
  PK: 'PK',
  PACK: 'PK',
  PAQ: 'PK',
  PQT: 'PK',
  PAQUETE: 'PK',
  PAQUETES: 'PK',
  BLS: 'BLS',
  BOLSA: 'BLS',
  BOLSAS: 'BLS',
  BO: 'BO',
  BOTELLA: 'BO',
  BOTELLAS: 'BO',
  CA: 'CA',
  LATA: 'CA',
  LATAS: 'CA',
  BJ: 'BJ',
  BALDE: 'BJ',
  BALDES: 'BJ',

  // Conteo (Docenas, Pares, Metros)
  DZN: 'DZN',
  DOC: 'DZN',
  DOCENA: 'DZN',
  DOCENAS: 'DZN',
  PR: 'PR',
  PAR: 'PR',
  PARES: 'PR',
  MTR: 'MTR',
  MT: 'MTR',
  M: 'MTR',
  METRO: 'MTR',
  METROS: 'MTR',
};

export function mapUnitTypeToSunat(unitType?: string | null): string {
  if (!unitType) return 'NIU';
  const clean = unitType.trim().toUpperCase();
  return SUNAT_UNIT_MAP[clean] || 'NIU';
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

    // 1. Recorrer y procesar el arreglo de items: calcular montos exactos línea por línea
    // (Valor venta, IGV y total con redondeo matemático por producto)
    let calculatedTotalGravada = 0;
    let calculatedTotalIgv = 0;
    let calculatedTotal = 0;

    const formattedItems = items.map((item) => {
      const itemSubtotal = Number((item.subtotal ?? item.quantity * item.unitPrice).toFixed(2));
      // Base imponible / Valor de venta de la línea gravada (redondeado a 2 decimales)
      const itemValorTotal = Number((itemSubtotal / 1.18).toFixed(2));
      // IGV de la línea: diferencia exacta entre el subtotal con IGV y el valor de venta
      const itemIgv = Number((itemSubtotal - itemValorTotal).toFixed(2));
      // Valor unitario sin IGV a 4 decimales según estándar Nubefact / SUNAT
      const itemValorUnitario =
        item.quantity > 0 ? Number((itemValorTotal / item.quantity).toFixed(4)) : 0;

      calculatedTotalGravada += itemValorTotal;
      calculatedTotalIgv += itemIgv;
      calculatedTotal += itemSubtotal;

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
    });

    // 2. Cabeceras calculadas estrictamente a partir de la suma línea por línea de los ítems
    // Esto garantiza consistencia matemática total (evita el rechazo de SUNAT por desfase de S/ 0.01)
    const finalTotalGravada = Number(calculatedTotalGravada.toFixed(2));
    const finalTotalIgv = Number(calculatedTotalIgv.toFixed(2));
    const finalTotal = Number(calculatedTotal.toFixed(2));

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
      total_gravada: finalTotalGravada,
      total_igv: finalTotalIgv,
      total: finalTotal,
      detraccion: false,
      items: formattedItems,
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
      pdfUrl: data.enlace_del_pdf || null,
      xmlUrl: data.enlace_del_xml || null,
      cdrUrl: data.enlace_del_cdr || null,
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

    // 1. Recorrer y procesar el arreglo de items línea por línea para la Nota de Crédito
    let calculatedTotalGravada = 0;
    let calculatedTotalIgv = 0;
    let calculatedTotal = 0;

    const formattedItems = items.map((item: any) => {
      const itemSubtotal = Number((item.subtotal ?? item.quantity * item.unitPrice).toFixed(2));
      const itemValorTotal = Number((itemSubtotal / 1.18).toFixed(2));
      const itemIgv = Number((itemSubtotal - itemValorTotal).toFixed(2));
      const itemValorUnitario =
        item.quantity > 0 ? Number((itemValorTotal / item.quantity).toFixed(4)) : 0;

      calculatedTotalGravada += itemValorTotal;
      calculatedTotalIgv += itemIgv;
      calculatedTotal += itemSubtotal;

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
    });

    const finalTotalGravada = Number(calculatedTotalGravada.toFixed(2));
    const finalTotalIgv = Number(calculatedTotalIgv.toFixed(2));
    const finalTotal = Number(calculatedTotal.toFixed(2));

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
      total_gravada: finalTotalGravada,
      total_igv: finalTotalIgv,
      total: finalTotal,
      documento_que_se_modifica_tipo: docModificaTipo,
      documento_que_se_modifica_serie: modifiedSeries,
      documento_que_se_modifica_numero: modifiedCorrelative,
      tipo_de_nota_de_credito: tipoNotaCreditoNum,
      motivo: reasonDescription || 'ANULACION DE LA OPERACION',
      detraccion: false,
      items: formattedItems,
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
      pdfUrl: data.enlace_del_pdf || null,
      xmlUrl: data.enlace_del_xml || null,
      cdrUrl: data.enlace_del_cdr || null,
      rawResponse: data,
    };
  }
}

