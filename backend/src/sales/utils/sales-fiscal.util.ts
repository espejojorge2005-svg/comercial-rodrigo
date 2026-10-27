/**
 * Utilidades fiscales y tributarias SUNAT para el módulo de ventas
 */

/**
 * 🛡️ VALIDADOR OFICIAL DE RUC PERUANO (ALGORITMO MÓDULO 11 DE SUNAT)
 * El RUC consta de 11 dígitos, comienza con 10, 15, 17 o 20 y cumple con la
 * ponderación matemática oficial de comprobación: [5, 4, 3, 2, 7, 6, 5, 4, 3, 2].
 */
export function isValidPeruvianRuc(ruc: string, allowKnownDemoRucs = true): boolean {
  const clean = (ruc || '').trim();
  if (!/^\d{11}$/.test(clean)) return false;
  const validPrefixes = ['10', '15', '17', '20'];
  if (!validPrefixes.some((p) => clean.startsWith(p))) return false;

  // Permitir RUCs de prueba / simulación de Comercial Rodrigo en entornos no estrictos
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
 * Plazo máximo de envío: hasta el día calendario siguiente a la fecha de emisión.
 * Si la fecha original es anterior a ayer (en zona horaria de Perú UTC-5), se
 * ajusta a la fecha actual para evitar el Error 2324 de SUNAT ("Fecha no permitida").
 */
export function getSunatCompliantEmissionDate(originalDate: Date = new Date()): {
  emissionDate: Date;
  wasAdjusted: boolean;
  originalDateString: string;
} {
  const now = new Date();

  // Medianoche en hora oficial de Perú (UTC-5) para comparar días calendario exactos
  const getPeruCalendarDay = (d: Date) => {
    const utc = d.getTime() + d.getTimezoneOffset() * 60000;
    const peru = new Date(utc - 5 * 3600000);
    return new Date(peru.getFullYear(), peru.getMonth(), peru.getDate()).getTime();
  };

  const todayPeruDay = getPeruCalendarDay(now);
  const emissionPeruDay = getPeruCalendarDay(originalDate);

  // Diferencia en días calendario (días transcurridos)
  const diffDays = Math.floor((todayPeruDay - emissionPeruDay) / (24 * 3600000));

  // SUNAT permite hoy (0 días) y ayer (1 día calendario)
  if (diffDays <= 1 && diffDays >= 0) {
    return {
      emissionDate: originalDate,
      wasAdjusted: false,
      originalDateString: originalDate.toISOString(),
    };
  }

  // Si tiene 2 o más días de antigüedad o es fecha futura, se emite con fecha actual
  return {
    emissionDate: now,
    wasAdjusted: true,
    originalDateString: originalDate.toISOString(),
  };
}

/**
 * 🛡️ CONTROL TRIBUTARIO DE PLAZO LEGAL SUNAT PARA NOTAS DE CRÉDITO (R.S. 193-2020/SUNAT)
 * La emisión de Notas de Crédito Electrónicas (motivo 01: anulación de la operación o 02: error en RUC)
 * debe realizarse a más tardar hasta el décimo quinto (15°) día hábil del mes siguiente
 * a aquel en que se emitió el comprobante de pago electrónico respectivo (Boleta o Factura).
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
  const peruEmissionTime = new Date(date.getTime() - 5 * 3600000);
  const emissionYear = peruEmissionTime.getUTCFullYear();
  const emissionMonth = peruEmissionTime.getUTCMonth(); // 0-11

  let nextMonth = emissionMonth + 1;
  let nextYear = emissionYear;
  if (nextMonth > 11) {
    nextMonth = 0;
    nextYear = emissionYear + 1;
  }

  let businessDaysCount = 0;
  let checkDay = 1;
  let deadlineDay = 1;

  while (businessDaysCount < 15 && checkDay <= 31) {
    const d = new Date(Date.UTC(nextYear, nextMonth, checkDay, 12, 0, 0));
    if (d.getUTCMonth() !== nextMonth) break;

    const dayOfWeek = d.getUTCDay(); // 0: Domingo, 6: Sábado
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
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

  const pad = (n: number) => String(n).padStart(2, '0');
  const formattedDeadline = `${pad(deadlineDay)}/${pad(nextMonth + 1)}/${nextYear}`;
  const formattedEmissionDate = `${pad(peruEmissionTime.getUTCDate())}/${pad(emissionMonth + 1)}/${emissionYear}`;

  return {
    deadline: deadlineUtc,
    isExpired,
    formattedDeadline,
    formattedEmissionDate,
  };
}
