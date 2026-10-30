import { describe, it, expect } from 'vitest';
import {
  numeroALetras,
  escapeHtml,
  sanitizeExternalUrl,
  getProductExpirationInfo,
  isValidPeruvianRuc,
} from './utils.js';

describe('SUNAT utils - numeroALetras (Catálogo 52)', () => {
  it('debe convertir cero soles correctamente', () => {
    expect(numeroALetras(0)).toBe('SON: CERO CON 00/100 SOLES');
    expect(numeroALetras('0.00')).toBe('SON: CERO CON 00/100 SOLES');
  });

  it('debe convertir un sol correctamente', () => {
    expect(numeroALetras(1)).toBe('SON: UN CON 00/100 SOLES');
    expect(numeroALetras(1.5)).toBe('SON: UN CON 50/100 SOLES');
  });

  it('debe redondear céntimos a 2 decimales evitando céntimos = 100 (ej. 19.999 -> 20.00)', () => {
    expect(numeroALetras(19.999)).toBe('SON: VEINTE CON 00/100 SOLES');
    expect(numeroALetras(99.996)).toBe('SON: CIEN CON 00/100 SOLES');
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

describe('Seguridad HTML y URLs externas', () => {
  it('escapeHtml debe neutralizar etiquetas y comillas peligrosas en tickets térmicos', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
    expect(escapeHtml("R&R 'Bodega'")).toBe('R&amp;R &#39;Bodega&#39;');
  });

  it('sanitizeExternalUrl solo debe permitir protocolos http y https', () => {
    expect(sanitizeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeExternalUrl('data:text/html;base64,PHNjcmlwdD4=')).toBeNull();
    expect(sanitizeExternalUrl('https://www.nubefact.com/cpe/test.pdf')).toBe(
      'https://www.nubefact.com/cpe/test.pdf',
    );
  });
});

describe('Zona horaria Perú (UTC-5) y RUC Módulo 11', () => {
  it('getProductExpirationInfo no debe restar un día en fechas ISO YYYY-MM-DD', () => {
    const info = getProductExpirationInfo('2099-11-30');
    expect(info.formattedDate).toBe('30/11/2099');
    expect(info.state).toBe('GOOD');
  });

  it('isValidPeruvianRuc debe validar prefijos 10, 15, 16, 17 y 20 con dígito verificador SUNAT', () => {
    expect(isValidPeruvianRuc('20100070970')).toBe(true); // RUC 20 válido
    expect(isValidPeruvianRuc('20100070971')).toBe(false); // Dígito verificador inválido
    // Prefijo 16 con Módulo 11 válido: 1612345678 -> 1*5+6*4+1*3+2*2+3*7+4*6+5*5+6*4+7*3+8*2 = 5+24+3+4+21+24+25+24+21+16 = 167; 11 - (167 % 11 = 2) = 9
    expect(isValidPeruvianRuc('16123456789')).toBe(true);
  });
});
