/**
 * Utilidades fiscales y tributarias SUNAT para el módulo de ventas
 */

/**
 * Unidades de medida discretas (conteo entero estricto)
 */
const DISCRETE_UNITS = new Set([
  'NIU',
  'UNIT',
  'UNI',
  'UNIDAD',
  'UNIDADES',
  'UND',
  'SA',
  'SACO',
  'BX',
  'CAJA',
  'PK',
  'PAQUETE',
  'DZN',
  'BO',
  'CA',
  'BJ',
  'PR',
]);

export function isDiscreteUnit(unitType?: string | null): boolean {
  if (!unitType) return false;
  return DISCRETE_UNITS.has(unitType.trim().toUpperCase());
}

/**
 * Tope legal vigente en Soles de la Ley de Bancarización en Perú
 * (Ley N° 28194 modificada por Decreto Legislativo N° 1529: S/ 2,000.00 o US$ 500.00)
 */
export const SUNAT_BANCARIZACION_SOLES_LIMIT = 2000;

export const FORBIDDEN_COMPANY_PLACEHOLDERS = [
  'CLIENTE VARIOS',
  'CLIENTES VARIOS',
  'EMPRESA',
  'EMPRESA SAC',
  'EMPRESA S.A.C.',
  'EMPRESA SRL',
  'EMPRESA S.R.L.',
  'RUC',
  'SIN NOMBRE',
  'VARIOS',
  '-',
  '---',
];

export const FORBIDDEN_BOLETA_IDENTIFIED_NAMES = [
  'CLIENTE VARIOS',
  'CLIENTES VARIOS',
  'SIN NOMBRE',
  'VARIOS',
  '-',
  '---',
];

/**
 * Valida formato de correo electrónico opcional para envío de PDF/XML en Nubefact.
 * Evita que correos truncados o con caracteres ilegales provoquen rechazo HTTP 400 en el PSE.
 */
export function isValidOptionalEmail(email?: string | null): boolean {
  const clean = (email || '').trim();
  if (!clean) return true;
  if (clean.length > 120) return false;
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(clean);
}

/**
 * Resuelve el código oficial del Catálogo 06 SUNAT (Tipo de Documento de Identidad)
 * evitando asignar RUC ('6'), CE ('4') o Pasaporte ('7') a documentos truncados o mal digitados.
 */
export function resolveSunatCustomerDocType(
  customerDocument?: string | null,
  fallbackEmpty: '-' | '0' | '6' = '-',
): string {
  const clean = (customerDocument || '').trim();
  if (!clean || clean === '-') return fallbackEmpty;

  // 11 dígitos numéricos: únicamente válido si cumple Algoritmo Módulo 11 de RUC SUNAT ('6')
  if (/^\d{11}$/.test(clean)) {
    return isValidPeruvianRuc(clean) ? '6' : fallbackEmpty;
  }

  // 8 dígitos numéricos (excluyendo puros ceros): DNI ('1')
  if (/^\d{8}$/.test(clean)) {
    return clean !== '00000000' ? '1' : fallbackEmpty;
  }

  // 9 dígitos numéricos (excluyendo puros ceros): Carnet de Extranjería Migraciones Perú ('4')
  if (/^\d{9}$/.test(clean)) {
    return !/^0+$/.test(clean) ? '4' : fallbackEmpty;
  }

  // Alfanumérico de 6 a 12 caracteres con al menos una letra y un dígito: CE ('4') o Pasaporte ('7')
  // Exigir letra + dígito impide clasificar palabras ("NINGUNO") o DNIs/RUCs truncados de 6-7 o 10 dígitos como Pasaporte.
  if (/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{6,12}$/.test(clean)) {
    return clean.toUpperCase().startsWith('CE') ? '4' : '7';
  }

  return fallbackEmpty;
}

/**
 * Validador integral de datos del cliente, correo y Ley de Bancarización (D.L. N° 1529)
 * para Boletas Electrónicas (03) y Facturas Electrónicas (01) antes de emitir en PSE / SUNAT.
 */
export function validateFiscalCustomerAndPayment(params: {
  receiptType: string;
  totalAmount?: number;
  paymentMethod?: string;
  cashPaid?: number;
  customerDocument?: string | null;
  customerName?: string | null;
  customerAddress?: string | null;
  customerEmail?: string | null;
}): { valid: boolean; message?: string } {
  const {
    receiptType,
    totalAmount,
    paymentMethod,
    cashPaid = 0,
    customerDocument,
    customerName,
    customerAddress,
    customerEmail,
  } = params;

  const cleanDoc = (customerDocument || '').trim();
  const cleanName = (customerName || '').trim();
  const cleanAddress = (customerAddress || '').trim();

  if (!isValidOptionalEmail(customerEmail)) {
    return {
      valid: false,
      message:
        'El correo electrónico del cliente tiene un formato inválido. Corríjalo o déjelo vacío para evitar el rechazo del comprobante en el PSE.',
    };
  }

  if (receiptType === 'FACTURA') {
    if (!isValidPeruvianRuc(cleanDoc)) {
      return {
        valid: false,
        message:
          'Para emitir Factura Electrónica se exige un RUC auténtico de 11 dígitos (que inicie con 10, 20, 15, 16 o 17) con dígito verificador válido ante SUNAT.',
      };
    }

    if (
      !cleanName ||
      cleanName.length < 3 ||
      FORBIDDEN_COMPANY_PLACEHOLDERS.includes(cleanName.toUpperCase())
    ) {
      return {
        valid: false,
        message:
          'La Razón Social de la empresa es estrictamente obligatoria para emitir Factura (mínimo 3 caracteres). Ingrese una Razón Social auténtica válida ante SUNAT.',
      };
    }

    if (!cleanAddress || cleanAddress.length < 3 || /^[-.\s]+$/.test(cleanAddress)) {
      return {
        valid: false,
        message:
          'La Dirección Fiscal de la empresa es estrictamente obligatoria para emitir Factura.',
      };
    }

    if (
      typeof totalAmount === 'number' &&
      totalAmount >= SUNAT_BANCARIZACION_SOLES_LIMIT &&
      (paymentMethod === 'CASH' || paymentMethod === 'MIXED' || Number(cashPaid) > 0)
    ) {
      return {
        valid: false,
        message: `Por Ley de Bancarización (Ley N° 28194 / D.L. N° 1529), toda Factura Electrónica por monto igual o superior a S/ ${SUNAT_BANCARIZACION_SOLES_LIMIT.toFixed(2)} (Total: S/ ${totalAmount.toFixed(2)}) debe pagarse íntegramente mediante un Medio de Pago del Sistema Financiero (Transferencia / Yape-Plin o Tarjeta, sin efectivo) para no perder el Crédito Fiscal ni la deducción ante SUNAT.`,
      };
    }
  } else if (receiptType === 'BOLETA') {
    const isHighValue = typeof totalAmount === 'number' && totalAmount >= 700;

    if (cleanDoc.length === 11 && /^\d{11}$/.test(cleanDoc) && !isValidPeruvianRuc(cleanDoc)) {
      return {
        valid: false,
        message:
          'El RUC de 11 dígitos consignado en la Boleta no tiene un dígito verificador válido ante SUNAT.',
      };
    }

    if (isHighValue) {
      const resolvedDocType = resolveSunatCustomerDocType(cleanDoc, '-');
      if (!cleanDoc || cleanDoc.length < 8 || cleanDoc.length > 12 || resolvedDocType === '-') {
        return {
          valid: false,
          message: `Para Boletas de Venta con monto igual o superior a S/ 700.00 (Total: S/ ${Number(totalAmount).toFixed(2)}), SUNAT exige identificar al cliente con DNI, Carnet de Extranjería o RUC válido (8 a 12 caracteres).`,
        };
      }
      if (
        !cleanName ||
        cleanName.length < 3 ||
        FORBIDDEN_BOLETA_IDENTIFIED_NAMES.includes(cleanName.toUpperCase())
      ) {
        return {
          valid: false,
          message:
            'Para Boletas de Venta con monto igual o superior a S/ 700.00, se requieren los nombres y apellidos completos del cliente.',
        };
      }
    } else if (cleanDoc && cleanDoc !== '-') {
      // Incluso en Boleta < S/ 700, si el cajero ingresa un documento opcional, este debe ser válido
      // ante SUNAT Catálogo 06 para evitar que Nubefact / SUNAT OSE rechace el comprobante electrónico.
      const resolvedDocType = resolveSunatCustomerDocType(cleanDoc, '-');
      if (resolvedDocType === '-') {
        return {
          valid: false,
          message:
            'El documento opcional ingresado en la Boleta es inválido o está incompleto. Ingrese un DNI (8 dígitos), Carnet de Extranjería (9 dígitos), Pasaporte o RUC válido (11 dígitos), o déjelo vacío si la venta es menor a S/ 700.00.',
        };
      }
      if (
        !cleanName ||
        cleanName.length < 3 ||
        FORBIDDEN_BOLETA_IDENTIFIED_NAMES.includes(cleanName.toUpperCase())
      ) {
        return {
          valid: false,
          message:
            'Cuando se consigna el documento del cliente en una Boleta Electrónica, debe ingresar también sus nombres y apellidos reales (no "Cliente Varios").',
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Extrae YYYY-MM-DD exacto en zona horaria oficial de Perú (America/Lima, UTC-5)
 * independientemente del huso horario del servidor (ej. UTC en Render/Docker).
 */
export function formatPeruYMD(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((p) => p.type === 'year')?.value || '2026';
  const month = parts.find((p) => p.type === 'month')?.value || '01';
  const day = parts.find((p) => p.type === 'day')?.value || '01';
  return `${year}-${month}-${day}`;
}

function peruYmdToEpochDays(ymd: string): number {
  const [y, m, d] = ymd.split('-').map((n) => parseInt(n, 10));
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/**
 * 🛡️ VALIDADOR OFICIAL DE RUC PERUANO (ALGORITMO MÓDULO 11 DE SUNAT)
 * El RUC consta de 11 dígitos, comienza con 10, 15, 16, 17 o 20 y cumple con la
 * ponderación matemática oficial de comprobación: [5, 4, 3, 2, 7, 6, 5, 4, 3, 2].
 * Nota: Los RUCs de práctica/simulación solo se aceptan cuando BILLING_DRIVER !== 'NUBEFACT'.
 */
export function isValidPeruvianRuc(
  ruc: string,
  allowKnownDemoRucs = process.env.BILLING_DRIVER !== 'NUBEFACT',
): boolean {
  const clean = (ruc || '').trim();
  if (!/^\d{11}$/.test(clean)) return false;
  const validPrefixes = ['10', '15', '16', '17', '20'];
  if (!validPrefixes.some((p) => clean.startsWith(p))) return false;

  // Permitir RUCs de práctica de Comercial Rodrigo cuando opera con driver MOCK
  if (allowKnownDemoRucs && (clean === '10458923011' || clean === '20601234567')) {
    return true;
  }

  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(clean[i], 10) * weights[i];
  }
  const remainder = sum % 11;
  let checkDigit = 11 - remainder;
  if (checkDigit === 10) checkDigit = 0;
  if (checkDigit === 11) checkDigit = 1;

  return checkDigit === parseInt(clean[10], 10);
}

/**
 * 🛡️ CONTROL TRIBUTARIO DE PLAZO DE ENVÍO SUNAT (R.S. N° 000003-2023/SUNAT)
 * Plazo máximo de envío: hasta el tercer (3°) día calendario siguiente a la fecha de emisión,
 * respetando además el orden cronológico de la serie (minAllowedDate).
 */
export function getSunatCompliantEmissionDate(
  originalDate: Date = new Date(),
  minAllowedDate?: Date | null,
): {
  emissionDate: Date;
  wasAdjusted: boolean;
  originalDateString: string;
} {
  const now = new Date();
  const todayDays = peruYmdToEpochDays(formatPeruYMD(now));
  const emissionDays = peruYmdToEpochDays(formatPeruYMD(originalDate));
  const diffDays = todayDays - emissionDays;

  let candidateDate = originalDate;
  let wasAdjusted = false;

  // R.S. N° 000003-2023/SUNAT: 0 a 3 días calendario siguientes a la fecha de emisión
  if (diffDays < 0 || diffDays > 3) {
    candidateDate = now;
    wasAdjusted = true;
  }

  // Regla de correlación cronológica SUNAT: un correlativo superior no puede tener fecha
  // de emisión anterior al último comprobante ya emitido en la misma serie.
  if (minAllowedDate) {
    const minDays = peruYmdToEpochDays(formatPeruYMD(minAllowedDate));
    const candidateDays = peruYmdToEpochDays(formatPeruYMD(candidateDate));
    if (candidateDays < minDays) {
      candidateDate = minDays <= todayDays ? minAllowedDate : now;
      wasAdjusted = true;
    }
  }

  return {
    emissionDate: candidateDate,
    wasAdjusted,
    originalDateString: originalDate.toISOString(),
  };
}

/**
 * Feriados nacionales fijos no laborables en Perú (MM-DD)
 */
const PERU_FIXED_HOLIDAYS = new Set([
  '01-01', // Año Nuevo
  '05-01', // Día del Trabajo
  '06-07', // Batalla de Arica y Día de la Bandera
  '06-29', // San Pedro y San Pablo
  '07-23', // Día de la Fuerza Aérea del Perú
  '07-28', // Fiestas Patrias
  '07-29', // Fiestas Patrias
  '08-06', // Batalla de Junín
  '08-30', // Santa Rosa de Lima
  '10-08', // Combate de Angamos
  '11-01', // Día de Todos los Santos
  '12-08', // Inmaculada Concepción
  '12-09', // Batalla de Ayacucho
  '12-25', // Navidad
]);

/**
 * 🛡️ CONTROL TRIBUTARIO DE PLAZO LEGAL SUNAT PARA NOTAS DE CRÉDITO (R.S. 193-2020/SUNAT)
 * La emisión de Notas de Crédito Electrónicas por motivos 01/02/03 debe realizarse
 * a más tardar hasta el décimo quinto (15°) día hábil del mes siguiente.
 */
export function getSunatCreditNoteDeadline(
  emissionDate: Date | string,
  currentDate: Date = new Date(),
): {
  deadline: Date;
  isExpired: boolean;
  formattedDeadline: string;
  formattedEmissionDate: string;
} {
  const date = new Date(emissionDate);
  const ymd = formatPeruYMD(date);
  const [emissionYear, emissionMonthOneBased, emissionDay] = ymd
    .split('-')
    .map((n) => parseInt(n, 10));
  const emissionMonth = emissionMonthOneBased - 1; // 0-11

  let nextMonth = emissionMonth + 1;
  let nextYear = emissionYear;
  if (nextMonth > 11) {
    nextMonth = 0;
    nextYear = emissionYear + 1;
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  let businessDaysCount = 0;
  let checkDay = 1;
  let deadlineDay = 1;

  while (businessDaysCount < 15 && checkDay <= 31) {
    const d = new Date(Date.UTC(nextYear, nextMonth, checkDay, 12, 0, 0));
    if (d.getUTCMonth() !== nextMonth) break;

    const dayOfWeek = d.getUTCDay(); // 0: Domingo, 6: Sábado
    const mmdd = `${pad(nextMonth + 1)}-${pad(checkDay)}`;
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !PERU_FIXED_HOLIDAYS.has(mmdd)) {
      businessDaysCount++;
      if (businessDaysCount === 15) {
        deadlineDay = checkDay;
        break;
      }
    }
    checkDay++;
  }

  // Límite final: 23:59:59.999 en hora de Perú (UTC-5) del día 15 hábil
  const deadlineUtc = new Date(Date.UTC(nextYear, nextMonth, deadlineDay, 23 + 5, 59, 59, 999));
  const isExpired = currentDate.getTime() > deadlineUtc.getTime();

  const formattedDeadline = `${pad(deadlineDay)}/${pad(nextMonth + 1)}/${nextYear}`;
  const formattedEmissionDate = `${pad(emissionDay)}/${pad(emissionMonth + 1)}/${emissionYear}`;

  return {
    deadline: deadlineUtc,
    isExpired,
    formattedDeadline,
    formattedEmissionDate,
  };
}
