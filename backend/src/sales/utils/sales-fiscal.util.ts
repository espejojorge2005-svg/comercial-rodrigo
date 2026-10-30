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
 * Resuelve el código oficial del Catálogo 06 SUNAT (Tipo de Documento de Identidad)
 * evitando asignar RUC ('6') a Carnets de Extranjería o Pasaportes de 11 caracteres.
 */
export function resolveSunatCustomerDocType(
  customerDocument?: string | null,
  fallbackEmpty: '-' | '0' | '6' = '-',
): string {
  const clean = (customerDocument || '').trim();
  if (!clean || clean === '-') return fallbackEmpty;

  // 6 = RUC (11 dígitos numéricos con prefijo SUNAT válido)
  if (/^(10|15|16|17|20)\d{9}$/.test(clean)) {
    return '6';
  }
  // 1 = DNI (8 dígitos numéricos)
  if (/^\d{8}$/.test(clean)) {
    return '1';
  }
  // 4 = Carnet de Extranjería (numérico o alfanumérico de 9 a 12 caracteres)
  if (/^[A-Za-z0-9]{9,12}$/.test(clean)) {
    return '4';
  }
  // 7 = Pasaporte (alfanumérico de 6 a 12 caracteres)
  if (/^[A-Za-z0-9]{6,12}$/.test(clean)) {
    return '7';
  }

  return fallbackEmpty;
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
