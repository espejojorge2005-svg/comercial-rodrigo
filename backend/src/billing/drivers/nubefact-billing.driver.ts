import { Injectable, Logger } from '@nestjs/common';
import {
  IBillingDriver,
  IssueReceiptInput,
  IssueCreditNoteInput,
  BillingIssueResult,
} from '../billing.types.js';
import {
  resolveSunatCustomerDocType,
  isValidOptionalEmail,
} from '../../sales/utils/sales-fiscal.util.js';

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
 * Mapeo Oficial Catálogo 03 SUNAT - Códigos de Unidades de Medida (UN/ECE Rec 20)
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

  // Empaques y Presentaciones (Sacos, Cajas, Paquetes, Bolsas -> BG, Latas, Botellas, Baldes)
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
  BG: 'BG',
  BLS: 'BG',
  BOLSA: 'BG',
  BOLSAS: 'BG',
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

/**
 * Normaliza la cabecera de autenticación requerida por la API REST de Nubefact.
 * Formato oficial Nubefact: Authorization: Token token="TU_TOKEN"
 */
export function buildNubefactAuthHeader(apiToken: string): string {
  const clean = (apiToken || '').trim();
  if (clean.startsWith('Token token=')) {
    return clean;
  }
  const rawToken = clean
    .replace(/^Bearer\s+/i, '')
    .replace(/^Token\s+/i, '')
    .replace(/^["']|["']$/g, '')
    .trim();
  return `Token token="${rawToken}"`;
}

const NUBEFACT_TIMEOUT_MS = 15_000;

/**
 * Sanitiza textos enviados a Nubefact eliminando saltos de línea, tabulaciones, caracteres
 * de control y tuberías ('|') que rompen el serializador interno UBL/TXT del PSE.
 */
export function sanitizeNubefactText(value?: string | null, maxLength = 250): string {
  if (!value) return '';
  return String(value)
    .replace(/[\r\n\t]+/g, ' ')
    .split('')
    .map((ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch))
    .join('')
    .replace(/\|/g, '-')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/**
 * Traduce el método de pago interno del POS a la descripción formal para el PDF/XML de Nubefact.
 */
export function mapPaymentMethodToNubefact(paymentMethod?: string | null): string {
  switch ((paymentMethod || '').toUpperCase()) {
    case 'CASH':
      return 'EFECTIVO';
    case 'TRANSFER':
      return 'TRANSFERENCIA / BILLETERA DIGITAL';
    case 'CARD':
      return 'TARJETA DE DEBITO / CREDITO';
    case 'MIXED':
      return 'PAGO MIXTO (CONTADO)';
    default:
      return 'CONTADO';
  }
}

/**
 * Resuelve tipo de documento entero (6, 1, 4, 7) o '-' según exigencia estricta de Nubefact JSON V1.
 * Garantiza que jamás se envíe cliente_tipo_de_documento: '-' acompañado de un número distinto de '-'.
 */
export function resolveNubefactCustomerIdentity(
  isFactura: boolean,
  rawDocument?: string | null,
  rawName?: string | null,
  rawAddress?: string | null,
): {
  clienteTipoDoc: number | '-';
  clienteNumeroDoc: string;
  clienteDenominacion: string;
  clienteDireccion: string;
} {
  const cleanDoc = sanitizeNubefactText(rawDocument, 15).replace(/\s+/g, '');
  const cleanName = sanitizeNubefactText(rawName, 100);
  const cleanAddr = sanitizeNubefactText(rawAddress, 150);

  if (isFactura) {
    return {
      clienteTipoDoc: 6,
      clienteNumeroDoc: cleanDoc,
      clienteDenominacion: cleanName || 'CLIENTE EMPRESA',
      clienteDireccion: cleanAddr || '-',
    };
  }

  const docTypeCode = resolveSunatCustomerDocType(cleanDoc, '-');
  if (docTypeCode !== '-') {
    return {
      clienteTipoDoc: parseInt(docTypeCode, 10),
      clienteNumeroDoc: cleanDoc,
      clienteDenominacion: cleanName || 'CLIENTES VARIOS',
      clienteDireccion: cleanAddr,
    };
  }

  return {
    clienteTipoDoc: '-',
    clienteNumeroDoc: '-',
    clienteDenominacion: cleanName || 'CLIENTES VARIOS',
    clienteDireccion: cleanAddr,
  };
}

function isAlreadyExistsInNubefact(data: any): boolean {
  if (!data) return false;
  if (Number(data.codigo) === 23) return true;
  const errStr = String(data.errors || data.message || '').toLowerCase();
  return errStr.includes('ya existe') && errStr.includes('nubefact');
}

function evaluateNubefactApiResponse(
  httpOk: boolean,
  data: any,
  series: string,
  correlativeNumber: number,
  docLabel: 'Comprobante' | 'Nota de Crédito',
  logger: Logger,
): BillingIssueResult {
  if (!httpOk || data.errors) {
    const errorMsg =
      data.errors ||
      data.sunat_description ||
      data.sunat_soap_error ||
      data.message ||
      'Error en respuesta de Nubefact / SUNAT';
    logger.error(`Error de emisión en Nubefact (${docLabel} ${series}-${correlativeNumber}): ${errorMsg}`);
    return {
      success: false,
      hash: data.codigo_hash || '',
      qrString: data.cadena_para_codigo_qr || '',
      emissionStatus: 'REJECTED',
      message: `Rechazado por PSE Nubefact: ${errorMsg}`,
      rawResponse: data,
    };
  }

  if (data.aceptada_por_sunat === false) {
    const rawCode = String(data.sunat_responsecode || '').trim();
    const codeNum = rawCode ? parseInt(rawCode, 10) : Number.NaN;
    const descText = String(data.sunat_description || '').trim();
    const soapErr = String(data.sunat_soap_error || '').trim();

    // En SUNAT OSE:
    // - Códigos 2000..3999 o SOAP Fault explícito = RECHAZADO definitivo (invalida el comprobante).
    // - Sin código (cola asíncrona / modo demo Nubefact) o códigos 0100..1999 (excepción temporal de conexión SUNAT)
    //   = PENDIENTE de confirmación CDR (se conservan hash, QR, PDF y XML firmados por Nubefact para consulta posterior).
    const isFormalSunatRejection =
      (codeNum >= 2000 && codeNum <= 3999) ||
      Boolean(soapErr) ||
      (Number.isNaN(codeNum) && Boolean(descText));

    if (!isFormalSunatRejection) {
      const pendingDetail = descText
        ? ` (${descText})`
        : ' (Firmado por Nubefact, en cola de validación CDR ante SUNAT)';
      logger.warn(
        `${docLabel} ${series}-${correlativeNumber} recibido por Nubefact y en espera de CDR SUNAT${pendingDetail}.`,
      );
      return {
        success: false,
        hash: data.codigo_hash || data.hash || '',
        qrString: data.cadena_para_codigo_qr || '',
        emissionStatus: 'PENDING',
        message: `${docLabel} recibido por PSE Nubefact y pendiente de confirmación CDR por SUNAT${pendingDetail}`,
        externalId: data.enlace || `${series}-${correlativeNumber}`,
        pdfUrl: data.enlace_del_pdf || null,
        xmlUrl: data.enlace_del_xml || null,
        cdrUrl: data.enlace_del_cdr || null,
        rawResponse: data,
      };
    }

    const errorMsg = descText || soapErr || `Código SUNAT ${rawCode}` || 'Observado por SUNAT';
    logger.error(`Rechazo SUNAT en Nubefact (${docLabel} ${series}-${correlativeNumber}): ${errorMsg}`);

    const isDeadlineError =
      docLabel === 'Nota de Crédito' &&
      (errorMsg.includes('2119') ||
        errorMsg.includes('2223') ||
        errorMsg.toLowerCase().includes('plazo') ||
        errorMsg.toLowerCase().includes('fuera de fecha'));

    const friendlyMessage = isDeadlineError
      ? `Rechazado por SUNAT: Plazo legal de emisión de Nota de Crédito vencido (R.S. 193-2020/SUNAT). Detalle: ${errorMsg}`
      : `Rechazado por SUNAT: ${errorMsg}`;

    return {
      success: false,
      hash: data.codigo_hash || '',
      qrString: data.cadena_para_codigo_qr || '',
      emissionStatus: 'REJECTED',
      message: friendlyMessage,
      rawResponse: data,
    };
  }

  return {
    success: true,
    hash: data.codigo_hash || data.hash || '',
    qrString: data.cadena_para_codigo_qr || '',
    emissionStatus: 'ACCEPTED',
    message: `${docLabel} aceptado por SUNAT a través de Nubefact`,
    externalId: data.enlace || `${series}-${correlativeNumber}`,
    pdfUrl: data.enlace_del_pdf || null,
    xmlUrl: data.enlace_del_xml || null,
    cdrUrl: data.enlace_del_cdr || null,
    rawResponse: data,
  };
}

@Injectable()
export class NubefactBillingDriver implements IBillingDriver {
  readonly driverName = 'NUBEFACT';
  private readonly logger = new Logger(NubefactBillingDriver.name);

  private async consultExistingNubefactDocument(
    apiUrl: string,
    apiToken: string,
    tipoDeComprobante: number,
    serie: string,
    numero: number,
    docLabel: 'Comprobante' | 'Nota de Crédito',
  ): Promise<BillingIssueResult> {
    this.logger.log(
      `Documento ${serie}-${numero} ya registrado en Nubefact (Código 23). Ejecutando consultar_comprobante para recuperar estado y enlaces...`,
    );

    const consultRes = await fetch(apiUrl, {
      method: 'POST',
      signal: AbortSignal.timeout(NUBEFACT_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        Authorization: buildNubefactAuthHeader(apiToken),
      },
      body: JSON.stringify({
        operacion: 'consultar_comprobante',
        tipo_de_comprobante: tipoDeComprobante,
        serie,
        numero: Number(numero),
      }),
    });

    if (consultRes.status >= 500 || consultRes.status === 429) {
      return {
        success: false,
        hash: '',
        qrString: '',
        emissionStatus: 'PENDING',
        message: `Servicio PSE Nubefact temporalmente no disponible al consultar ${serie}-${numero} (HTTP ${consultRes.status}).`,
      };
    }

    let consultData: any;
    try {
      consultData = await consultRes.json();
    } catch {
      return {
        success: false,
        hash: '',
        qrString: '',
        emissionStatus: 'PENDING',
        message: `Respuesta temporal inválida al consultar ${serie}-${numero} en Nubefact.`,
      };
    }

    return evaluateNubefactApiResponse(
      consultRes.ok,
      consultData,
      serie,
      numero,
      docLabel,
      this.logger,
    );
  }

  async issueReceipt(input: IssueReceiptInput): Promise<BillingIssueResult> {
    const apiUrl = process.env.NUBEFACT_URL;
    const apiToken = process.env.NUBEFACT_TOKEN;

    if (!apiUrl || !apiToken) {
      this.logger.warn(
        'Credenciales de Nubefact (NUBEFACT_URL / NUBEFACT_TOKEN) no encontradas en .env.',
      );
      throw new Error(
        'El driver NUBEFACT requiere configurar NUBEFACT_URL y NUBEFACT_TOKEN en las variables de entorno.',
      );
    }

    const {
      receiptType,
      series,
      correlativeNumber,
      customerName,
      customerDocument,
      customerAddress,
      customerEmail,
      paymentMethod,
      items,
      createdAt = new Date(),
    } = input;

    // Catálogo Nubefact: 1 = Factura, 2 = Boleta
    const isFactura = receiptType === 'FACTURA';
    const tipoDeComprobante = isFactura ? 1 : 2;
    const {
      clienteTipoDoc,
      clienteNumeroDoc,
      clienteDenominacion,
      clienteDireccion,
    } = resolveNubefactCustomerIdentity(
      isFactura,
      customerDocument,
      customerName,
      customerAddress,
    );

    // Zona horaria oficial de Perú (America/Lima / UTC-5)
    const fechaEmision = formatPeruDDMMYYYY(createdAt);

    // 1. Procesar ítems línea por línea según UBL 2.1 (valor_unitario y precio_unitario hasta 10 decimales)
    let calculatedTotalGravada = 0;
    let calculatedTotalIgv = 0;
    let calculatedTotal = 0;

    const formattedItems = items.map((item) => {
      const itemSubtotal = Number((item.subtotal ?? item.quantity * item.unitPrice).toFixed(2));
      const itemValorTotal = Number((itemSubtotal / 1.18).toFixed(2));
      const itemIgv = Number((itemSubtotal - itemValorTotal).toFixed(2));
      const effectiveUnitPrice =
        item.quantity > 0 ? itemSubtotal / item.quantity : item.unitPrice;
      // UBL 2.1 cbc:PriceAmount permite hasta 10 decimales para evitar errores OSE 2027 / 3244
      // incluso en pesajes fraccionados (ej. 0.333 kg) o precios consolidados.
      const itemValorUnitario =
        item.quantity > 0 ? Number((effectiveUnitPrice / 1.18).toFixed(10)) : 0;
      const itemPrecioUnitario =
        item.quantity > 0 ? Number(effectiveUnitPrice.toFixed(10)) : 0;

      calculatedTotalGravada += itemValorTotal;
      calculatedTotalIgv += itemIgv;
      calculatedTotal += itemSubtotal;

      return {
        unidad_de_medida: mapUnitTypeToSunat(item.unitType),
        codigo: sanitizeNubefactText(item.barcode, 30),
        descripcion: sanitizeNubefactText(item.name, 250) || 'PRODUCTO',
        cantidad: Number(Number(item.quantity).toFixed(4)),
        valor_unitario: itemValorUnitario,
        precio_unitario: itemPrecioUnitario,
        subtotal: itemValorTotal,
        tipo_de_igv: 1, // Gravado - Operación Onerosa (Catálogo 07: código 10)
        igv: itemIgv,
        total: itemSubtotal,
        anticipo_regularizacion: false,
      };
    });

    const finalTotalGravada = Number(calculatedTotalGravada.toFixed(2));
    const finalTotalIgv = Number(calculatedTotalIgv.toFixed(2));
    const finalTotal = Number(calculatedTotal.toFixed(2));

    const rawEmail = (customerEmail || '').trim();
    const cleanEmail = isValidOptionalEmail(rawEmail) ? rawEmail : '';

    const payload = {
      operacion: 'generar_comprobante',
      tipo_de_comprobante: tipoDeComprobante,
      serie: String(series).trim(),
      numero: Number(correlativeNumber),
      sunat_transaction: 1,
      cliente_tipo_de_documento: clienteTipoDoc,
      cliente_numero_de_documento: clienteNumeroDoc,
      cliente_denominacion: clienteDenominacion,
      cliente_direccion: clienteDireccion,
      cliente_email: cleanEmail,
      fecha_de_emision: fechaEmision,
      moneda: 1, // PEN Soles
      porcentaje_de_igv: 18.0,
      total_gravada: finalTotalGravada,
      total_igv: finalTotalIgv,
      total: finalTotal,
      condiciones_de_pago: 'CONTADO', // R.S. 000193-2020/SUNAT
      medio_de_pago: mapPaymentMethodToNubefact(paymentMethod),
      detraccion: false,
      enviar_automaticamente_a_la_sunat: true,
      enviar_automaticamente_al_cliente: Boolean(cleanEmail),
      items: formattedItems,
    };

    this.logger.log(`Enviando comprobante a Nubefact (${apiUrl}): ${series}-${correlativeNumber}`);

    const response = await fetch(apiUrl, {
      method: 'POST',
      signal: AbortSignal.timeout(NUBEFACT_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        Authorization: buildNubefactAuthHeader(apiToken),
      },
      body: JSON.stringify(payload),
    });

    // Errores transitorios de pasarela/servidor (502/503/504/429) deben quedar PENDING para reintento
    if (response.status >= 500 || response.status === 429) {
      this.logger.warn(
        `Nubefact respondió HTTP ${response.status} temporal para ${series}-${correlativeNumber}. Se preserva en PENDING.`,
      );
      return {
        success: false,
        hash: '',
        qrString: '',
        emissionStatus: 'PENDING',
        message: `Servicio PSE Nubefact temporalmente no disponible (HTTP ${response.status}). Queda pendiente de reenvío.`,
      };
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      this.logger.warn(
        `Respuesta no-JSON desde Nubefact (HTTP ${response.status}) para ${series}-${correlativeNumber}. Se preserva en PENDING.`,
      );
      return {
        success: false,
        hash: '',
        qrString: '',
        emissionStatus: 'PENDING',
        message: `Respuesta temporal inválida del PSE Nubefact (HTTP ${response.status}). Queda pendiente de reenvío.`,
      };
    }

    if (isAlreadyExistsInNubefact(data)) {
      return this.consultExistingNubefactDocument(
        apiUrl,
        apiToken,
        tipoDeComprobante,
        String(series).trim(),
        Number(correlativeNumber),
        'Comprobante',
      );
    }

    return evaluateNubefactApiResponse(
      response.ok,
      data,
      String(series).trim(),
      Number(correlativeNumber),
      'Comprobante',
      this.logger,
    );
  }

  async issueCreditNote(input: IssueCreditNoteInput): Promise<BillingIssueResult> {
    const apiUrl = process.env.NUBEFACT_URL;
    const apiToken = process.env.NUBEFACT_TOKEN;

    if (!apiUrl || !apiToken) {
      this.logger.warn(
        'Credenciales de Nubefact (NUBEFACT_URL / NUBEFACT_TOKEN) no encontradas en .env.',
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
      customReason,
      customerName,
      customerDocument,
      customerAddress,
      customerEmail,
      items,
      createdAt = new Date(),
    } = input;

    // Catálogo Nubefact: 3 = Nota de Crédito
    const tipoDeComprobante = 3;
    const isModifiedFactura = modifiedDocTypeCode === '01';
    const {
      clienteTipoDoc,
      clienteNumeroDoc,
      clienteDenominacion,
      clienteDireccion,
    } = resolveNubefactCustomerIdentity(
      isModifiedFactura,
      customerDocument,
      customerName,
      customerAddress,
    );

    const fechaEmision = formatPeruDDMMYYYY(createdAt);

    // Nubefact: documento_que_se_modifica_tipo: 1 = Factura, 2 = Boleta
    const docModificaTipo = isModifiedFactura ? 1 : 2;
    const tipoNotaCreditoNum = parseInt(reasonCode, 10) || 1;

    let calculatedTotalGravada = 0;
    let calculatedTotalIgv = 0;
    let calculatedTotal = 0;

    const formattedItems = items.map((item: any) => {
      const itemSubtotal = Number((item.subtotal ?? item.quantity * item.unitPrice).toFixed(2));
      const itemValorTotal = Number((itemSubtotal / 1.18).toFixed(2));
      const itemIgv = Number((itemSubtotal - itemValorTotal).toFixed(2));
      const effectiveUnitPrice =
        item.quantity > 0 ? itemSubtotal / item.quantity : item.unitPrice;
      const itemValorUnitario =
        item.quantity > 0 ? Number((effectiveUnitPrice / 1.18).toFixed(10)) : 0;
      const itemPrecioUnitario =
        item.quantity > 0 ? Number(effectiveUnitPrice.toFixed(10)) : 0;

      calculatedTotalGravada += itemValorTotal;
      calculatedTotalIgv += itemIgv;
      calculatedTotal += itemSubtotal;

      return {
        unidad_de_medida: mapUnitTypeToSunat(item.unitType),
        codigo: sanitizeNubefactText(item.barcode, 30),
        descripcion: sanitizeNubefactText(item.name, 250) || 'PRODUCTO',
        cantidad: Number(Number(item.quantity).toFixed(4)),
        valor_unitario: itemValorUnitario,
        precio_unitario: itemPrecioUnitario,
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

    const rawEmail = (customerEmail || '').trim();
    const cleanEmail = isValidOptionalEmail(rawEmail) ? rawEmail : '';
    const rawMotivo = customReason
      ? `${reasonDescription || 'ANULACION DE LA OPERACION'} - ${customReason}`
      : reasonDescription || 'ANULACION DE LA OPERACION';
    const cleanMotivo = sanitizeNubefactText(rawMotivo, 250) || 'ANULACION DE LA OPERACION';

    const payload = {
      operacion: 'generar_comprobante',
      tipo_de_comprobante: tipoDeComprobante,
      serie: String(creditNoteSeries).trim(),
      numero: Number(creditNoteCorrelative),
      sunat_transaction: 1,
      cliente_tipo_de_documento: clienteTipoDoc,
      cliente_numero_de_documento: clienteNumeroDoc,
      cliente_denominacion: clienteDenominacion,
      cliente_direccion: clienteDireccion,
      cliente_email: cleanEmail,
      fecha_de_emision: fechaEmision,
      moneda: 1, // Soles
      porcentaje_de_igv: 18.0,
      total_gravada: finalTotalGravada,
      total_igv: finalTotalIgv,
      total: finalTotal,
      documento_que_se_modifica_tipo: docModificaTipo,
      documento_que_se_modifica_serie: String(modifiedSeries).trim(),
      documento_que_se_modifica_numero: Number(modifiedCorrelative),
      tipo_de_nota_de_credito: tipoNotaCreditoNum,
      motivo: cleanMotivo,
      observaciones: cleanMotivo,
      detraccion: false,
      enviar_automaticamente_a_la_sunat: true,
      enviar_automaticamente_al_cliente: Boolean(cleanEmail),
      items: formattedItems,
    };

    this.logger.log(
      `Enviando Nota de Crédito a Nubefact (${apiUrl}): ${creditNoteSeries}-${creditNoteCorrelative} (Modifica ${modifiedSeries}-${modifiedCorrelative})`,
    );

    const response = await fetch(apiUrl, {
      method: 'POST',
      signal: AbortSignal.timeout(NUBEFACT_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        Authorization: buildNubefactAuthHeader(apiToken),
      },
      body: JSON.stringify(payload),
    });

    if (response.status >= 500 || response.status === 429) {
      return {
        success: false,
        hash: '',
        qrString: '',
        emissionStatus: 'PENDING',
        message: `Servicio PSE Nubefact temporalmente no disponible (HTTP ${response.status}). Nota de Crédito pendiente de reenvío.`,
      };
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      return {
        success: false,
        hash: '',
        qrString: '',
        emissionStatus: 'PENDING',
        message: `Respuesta temporal inválida del PSE Nubefact (HTTP ${response.status}). Nota de Crédito pendiente de reenvío.`,
      };
    }

    if (isAlreadyExistsInNubefact(data)) {
      return this.consultExistingNubefactDocument(
        apiUrl,
        apiToken,
        tipoDeComprobante,
        String(creditNoteSeries).trim(),
        Number(creditNoteCorrelative),
        'Nota de Crédito',
      );
    }

    return evaluateNubefactApiResponse(
      response.ok,
      data,
      String(creditNoteSeries).trim(),
      Number(creditNoteCorrelative),
      'Nota de Crédito',
      this.logger,
    );
  }
}
