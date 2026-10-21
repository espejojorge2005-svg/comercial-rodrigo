import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  const val = isNaN(num) ? 0 : num;
  const isNegative = val < 0;
  const absVal = Math.abs(val);

  const formattedAbs = new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(absVal)
    .replace(/\s+/g, '\u00A0');

  return isNegative ? `-${formattedAbs}` : formattedAbs;
}


/**
 * Zona horaria oficial de Perú (GMT-5 / America/Lima)
 */
export const PERU_TIMEZONE = 'America/Lima';

/**
 * Retorna la fecha actual en Perú en formato YYYY-MM-DD
 */
export function getPeruYMD(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PERU_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Formatea fecha y hora en zona horaria de Perú (GMT-5)
 * Ej: "10/10/2026, 06:45:20 p. m." o "10/10/2026, 06:45 p. m."
 */
export function formatPeruDateTime(
  date: Date | string | number | null | undefined,
  includeSeconds = true,
): string {
  if (!date) return '--';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '--';

  return new Intl.DateTimeFormat('es-PE', {
    timeZone: PERU_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
    hour12: true,
  }).format(d);
}

/**
 * Formatea solo la fecha en zona horaria de Perú (GMT-5)
 * Ej: "10/10/2026"
 */
export function formatPeruDate(date: Date | string | number | null | undefined): string {
  if (!date) return '--';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '--';

  return new Intl.DateTimeFormat('es-PE', {
    timeZone: PERU_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/**
 * Formatea solo la hora en zona horaria de Perú (GMT-5)
 * Ej: "06:45 p. m." o "06:45:10 p. m."
 */
export function formatPeruTime(
  date: Date | string | number | null | undefined,
  includeSeconds = false,
): string {
  if (!date) return '--';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '--';

  return new Intl.DateTimeFormat('es-PE', {
    timeZone: PERU_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
    hour12: true,
  }).format(d);
}

/**
 * Estado formal de vencimiento de un producto
 */
export type ProductExpirationState = 'EXPIRED' | 'CRITICAL' | 'WARNING' | 'GOOD' | 'NO_EXPIRATION';

export interface ProductExpirationInfo {
  state: ProductExpirationState;
  daysDiff: number | null;
  label: string;
  badgeText: string;
  formattedDate: string;
}

/**
 * Calcula el estado de vencimiento de un producto contra la fecha actual
 */
export function getProductExpirationInfo(
  expirationDate?: Date | string | null,
): ProductExpirationInfo {
  if (!expirationDate) {
    return {
      state: 'NO_EXPIRATION',
      daysDiff: null,
      label: 'Sin vencimiento',
      badgeText: 'No perecible',
      formattedDate: '--',
    };
  }

  const exp = new Date(expirationDate);
  if (isNaN(exp.getTime())) {
    return {
      state: 'NO_EXPIRATION',
      daysDiff: null,
      label: 'Sin vencimiento',
      badgeText: 'No perecible',
      formattedDate: '--',
    };
  }

  // Normalizar día exacto
  const expYear = exp.getUTCFullYear();
  const expMonth = exp.getUTCMonth();
  const expDay = exp.getUTCDate();

  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const expUtc = Date.UTC(expYear, expMonth, expDay);

  const diffMs = expUtc - todayUtc;
  const daysDiff = Math.round(diffMs / (1000 * 60 * 60 * 24));
  const formattedDate = formatPeruDate(exp);

  if (daysDiff < 0) {
    const absDays = Math.abs(daysDiff);
    return {
      state: 'EXPIRED',
      daysDiff,
      label: `Vencido hace ${absDays} ${absDays === 1 ? 'día' : 'días'}`,
      badgeText: `Vencido (${absDays}d)`,
      formattedDate,
    };
  } else if (daysDiff === 0) {
    return {
      state: 'CRITICAL',
      daysDiff: 0,
      label: 'Vence hoy',
      badgeText: '¡Vence Hoy!',
      formattedDate,
    };
  } else if (daysDiff <= 7) {
    return {
      state: 'CRITICAL',
      daysDiff,
      label: `Vence en ${daysDiff} ${daysDiff === 1 ? 'día' : 'días'}`,
      badgeText: `Vence en ${daysDiff}d`,
      formattedDate,
    };
  } else if (daysDiff <= 30) {
    return {
      state: 'WARNING',
      daysDiff,
      label: `Vence en ${daysDiff} días`,
      badgeText: `En ${daysDiff} días`,
      formattedDate,
    };
  } else {
    return {
      state: 'GOOD',
      daysDiff,
      label: `Vigente (vence en ${daysDiff} días)`,
      badgeText: 'Vigente',
      formattedDate,
    };
  }
}

/**
 * 🛡️ REGLA SUNAT (Catálogo 52 - Código 1000): LEYENDA DEL MONTO EN LETRAS
 * Convierte un número monetario a su representación formal en letras en Soles peruanos.
 * Formato: "SON: [MONTO EN LETRAS] CON [XX]/100 SOLES"
 * Ejemplos:
 * 150.50 -> "SON: CIENTO CINCUENTA CON 50/100 SOLES"
 * 100.00 -> "SON: CIEN CON 00/100 SOLES"
 * 1.00   -> "SON: UN CON 00/100 SOLES"
 * 0.00   -> "SON: CERO CON 00/100 SOLES"
 */
export function numeroALetras(monto: number | string): string {
  const num = typeof monto === 'string' ? parseFloat(monto) : monto;
  if (isNaN(num) || num < 0) return 'SON: CERO CON 00/100 SOLES';

  const entero = Math.floor(num);
  const centavos = Math.round((num - entero) * 100);
  const centavosStr = String(centavos).padStart(2, '0').slice(0, 2);

  const unidades = [
    '',
    'UN',
    'DOS',
    'TRES',
    'CUATRO',
    'CINCO',
    'SEIS',
    'SIETE',
    'OCHO',
    'NUEVE',
    'DIEZ',
    'ONCE',
    'DOCE',
    'TRECE',
    'CATORCE',
    'QUINCE',
    'DIECISÉIS',
    'DIECISIETE',
    'DIECIOCHO',
    'DIECINUEVE',
    'VEINTE',
    'VEINTIUNO',
    'VEINTIDÓS',
    'VEINTITRÉS',
    'VEINTICUATRO',
    'VEINTICINCO',
    'VEINTISÉIS',
    'VEINTISIETE',
    'VEINTIOCHO',
    'VEINTINUEVE',
  ];

  const decenas = [
    '',
    '',
    '',
    'TREINTA',
    'CUARENTA',
    'CINCUENTA',
    'SESENTA',
    'SETENTA',
    'OCHENTA',
    'NOVENTA',
  ];

  const centenas = [
    '',
    'CIENTO',
    'DOSCIENTOS',
    'TRESCIENTOS',
    'CUATROCIENTOS',
    'QUINIENTOS',
    'SEISCIENTOS',
    'SETECIENTOS',
    'OCHOCIENTOS',
    'NOVECIENTOS',
  ];

  function convertirCentenas(n: number): string {
    if (n === 0) return '';
    if (n === 100) return 'CIEN';
    let output = '';
    if (n > 99) {
      output += centenas[Math.floor(n / 100)] + ' ';
      n %= 100;
    }
    if (n <= 29) {
      output += unidades[n];
    } else {
      const dec = Math.floor(n / 10);
      const uni = n % 10;
      output += decenas[dec];
      if (uni > 0) {
        output += ' Y ' + (uni === 1 ? 'UN' : unidades[uni]);
      }
    }
    return output.trim();
  }

  function convertirGrupo(n: number): string {
    if (n === 0) return 'CERO';
    let resultado = '';

    const millones = Math.floor(n / 1000000);
    const miles = Math.floor((n % 1000000) / 1000);
    const resto = n % 1000;

    if (millones > 0) {
      if (millones === 1) {
        resultado += 'UN MILLÓN ';
      } else {
        resultado += convertirCentenas(millones) + ' MILLONES ';
      }
    }

    if (miles > 0) {
      if (miles === 1) {
        resultado += 'MIL ';
      } else {
        resultado += convertirCentenas(miles) + ' MIL ';
      }
    }

    if (resto > 0 || resultado === '') {
      resultado += convertirCentenas(resto);
    }

    return resultado.trim();
  }

  const letras = convertirGrupo(entero);
  return `SON: ${letras || 'CERO'} CON ${centavosStr}/100 SOLES`;
}

