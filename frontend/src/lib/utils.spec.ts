import { describe, it, expect } from 'vitest';
import { numeroALetras } from './utils.js';

describe('SUNAT utils - numeroALetras (Catálogo 52)', () => {
  it('debe convertir cero soles correctamente', () => {
    expect(numeroALetras(0)).toBe('SON: CERO CON 00/100 SOLES');
    expect(numeroALetras('0.00')).toBe('SON: CERO CON 00/100 SOLES');
  });

  it('debe convertir un sol correctamente', () => {
    expect(numeroALetras(1)).toBe('SON: UN CON 00/100 SOLES');
    expect(numeroALetras(1.5)).toBe('SON: UN CON 50/100 SOLES');
  });

  it('debe convertir números de decenas y unidades con céntimos', () => {
    expect(numeroALetras(15.2)).toBe('SON: QUINCE CON 20/100 SOLES');
    expect(numeroALetras(21.05)).toBe('SON: VEINTIUNO CON 05/100 SOLES');
    expect(numeroALetras(35.9)).toBe('SON: TREINTA Y CINCO CON 90/100 SOLES');
    expect(numeroALetras(99.99)).toBe('SON: NOVENTA Y NUEVE CON 99/100 SOLES');
  });

  it('debe convertir centenas correctamente', () => {
    expect(numeroALetras(100)).toBe('SON: CIEN CON 00/100 SOLES');
    expect(numeroALetras(105)).toBe('SON: CIENTO CINCO CON 00/100 SOLES');
    expect(numeroALetras(150.5)).toBe('SON: CIENTO CINCUENTA CON 50/100 SOLES');
    expect(numeroALetras(500)).toBe('SON: QUINIENTOS CON 00/100 SOLES');
    expect(numeroALetras(999.5)).toBe('SON: NOVECIENTOS NOVENTA Y NUEVE CON 50/100 SOLES');
  });

  it('debe convertir miles y millones correctamente', () => {
    expect(numeroALetras(1000)).toBe('SON: MIL CON 00/100 SOLES');
    expect(numeroALetras(1250.75)).toBe('SON: MIL DOSCIENTOS CINCUENTA CON 75/100 SOLES');
    expect(numeroALetras(2000)).toBe('SON: DOS MIL CON 00/100 SOLES');
    expect(numeroALetras(15000)).toBe('SON: QUINCE MIL CON 00/100 SOLES');
    expect(numeroALetras(1000000)).toBe('SON: UN MILLÓN CON 00/100 SOLES');
  });
});
