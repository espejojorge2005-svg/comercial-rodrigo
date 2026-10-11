import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
  }).format(isNaN(num) ? 0 : num);
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
