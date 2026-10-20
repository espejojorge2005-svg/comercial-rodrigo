import { describe, it, expect, beforeEach } from 'vitest';
import { MockBillingDriver } from './drivers/mock-billing.driver.js';
import { NubefactBillingDriver, mapUnitTypeToSunat } from './drivers/nubefact-billing.driver.js';
import { BillingService } from './billing.service.js';

describe('Billing Engine & Drivers (Triple Vía Fiscal)', () => {
  let mockDriver: MockBillingDriver;
  let nubefactDriver: NubefactBillingDriver;
  let billingService: BillingService;

  beforeEach(() => {
    mockDriver = new MockBillingDriver();
    nubefactDriver = new NubefactBillingDriver();
    billingService = new BillingService(mockDriver, nubefactDriver);
  });

  describe('MockBillingDriver', () => {
    it('debe generar código Hash y cadena oficial QR de SUNAT para Boleta Electrónica', async () => {
      const result = await mockDriver.issueReceipt({
        receiptType: 'BOLETA',
        series: 'B001',
        correlativeNumber: 128,
        totalAmount: 118.0,
        taxableBase: 100.0,
        igvAmount: 18.0,
        customerName: 'Juan Pérez',
        customerDocument: '45892301',
        paymentMethod: 'CASH',
        items: [
          { name: 'Arroz Costeño 1kg', quantity: 20, unitPrice: 5.9, subtotal: 118.0 },
        ],
        companyRuc: '10458923011',
      });

      expect(result.success).toBe(true);
      expect(result.emissionStatus).toBe('SIMULATED');
      expect(result.hash).toBeDefined();
      expect(result.hash.length).toBeGreaterThanOrEqual(20);

      // SUNAT standard pipe format: RUC|03|SERIE|NUMERO|IGV|TOTAL|FECHA|1|DNI|HASH|
      expect(result.qrString).toContain('10458923011|03|B001|00000128|18.00|118.00|');
      expect(result.qrString).toContain('|1|45892301|');
    });

    it('debe generar comprobante fiscal para Factura Electrónica con tipo 01 y RUC tipo 6', async () => {
      const result = await mockDriver.issueReceipt({
        receiptType: 'FACTURA',
        series: 'F001',
        correlativeNumber: 34,
        totalAmount: 590.0,
        taxableBase: 500.0,
        igvAmount: 90.0,
        customerName: 'DISTRIBUIDORA LIMA SAC',
        customerDocument: '20601234567',
        customerAddress: 'Av. Industrial 456, Lima',
        paymentMethod: 'TRANSFER',
        items: [
          { name: 'Aceite Primor 1L', quantity: 50, unitPrice: 11.8, subtotal: 590.0 },
        ],
        companyRuc: '10458923011',
      });

      expect(result.success).toBe(true);
      expect(result.emissionStatus).toBe('SIMULATED');
      // 01 = Factura Electrónica, 6 = RUC
      expect(result.qrString).toContain('10458923011|01|F001|00000034|90.00|590.00|');
      expect(result.qrString).toContain('|6|20601234567|');
    });
  });

  describe('NubefactBillingDriver (Precisión de Céntimos IGV)', () => {
    it('debe calcular la cabecera sumando línea por línea para evitar rechazo por céntimos en SUNAT', async () => {
      process.env.NUBEFACT_URL = 'https://api.nubefact.com/api/v1/mock-test';
      process.env.NUBEFACT_TOKEN = 'test-token-123';

      let capturedPayload: any = null;
      const originalFetch = global.fetch;
      global.fetch = (async (_url: any, options: any) => {
        capturedPayload = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({
            codigo_hash: 'AbCdEf1234567890HashMock=',
            cadena_para_codigo_qr: 'QR-CODE-TEST',
            enlace: 'https://nubefact.com/mock-receipt',
          }),
        } as any;
      }) as any;

      try {
        await nubefactDriver.issueReceipt({
          receiptType: 'BOLETA',
          series: 'B001',
          correlativeNumber: 99,
          totalAmount: 69.38,
          taxableBase: 58.80, // Si viniera con redondeo global ingenuo
          igvAmount: 10.58,   // Si viniera con redondeo global ingenuo
          customerName: 'Cliente Prueba',
          paymentMethod: 'CASH',
          items: [
            { name: 'Producto A', quantity: 3, unitPrice: 10.55, subtotal: 31.65, unitType: 'UNIT' },
            { name: 'Producto B', quantity: 1, unitPrice: 7.33, subtotal: 7.33, unitType: 'KG' },
            { name: 'Producto C', quantity: 2, unitPrice: 15.20, subtotal: 30.40, unitType: 'LT' },
          ],
        });

        expect(capturedPayload).not.toBeNull();
        // Suma exacta de items: 26.82 + 6.21 + 25.76 = 58.79 (no 58.80)
        expect(capturedPayload.total_gravada).toBe(58.79);
        // Suma exacta de IGV items: 4.83 + 1.12 + 4.64 = 10.59 (no 10.58)
        expect(capturedPayload.total_igv).toBe(10.59);
        // Total general
        expect(capturedPayload.total).toBe(69.38);
        // Consistencia matemática absoluta
        expect(Number((capturedPayload.total_gravada + capturedPayload.total_igv).toFixed(2))).toBe(
          capturedPayload.total,
        );

        // Validar mapeo de unidades SUNAT
        expect(capturedPayload.items[0].unidad_de_medida).toBe('NIU');
        expect(capturedPayload.items[1].unidad_de_medida).toBe('KGM');
        expect(capturedPayload.items[2].unidad_de_medida).toBe('LTR');
      } finally {
        global.fetch = originalFetch;
        delete process.env.NUBEFACT_URL;
        delete process.env.NUBEFACT_TOKEN;
      }
    });
  });

  describe('mapUnitTypeToSunat (Catálogo 03 SUNAT y Fallback a NIU)', () => {
    it('debe mapear correctamente unidades estándar y aliases comunes a códigos oficiales SUNAT', () => {
      expect(mapUnitTypeToSunat('UNIT')).toBe('NIU');
      expect(mapUnitTypeToSunat('NIU')).toBe('NIU');
      expect(mapUnitTypeToSunat('UNIDAD')).toBe('NIU');
      expect(mapUnitTypeToSunat('UND')).toBe('NIU');

      expect(mapUnitTypeToSunat('KG')).toBe('KGM');
      expect(mapUnitTypeToSunat('KGM')).toBe('KGM');
      expect(mapUnitTypeToSunat('KILOGRAMO')).toBe('KGM');

      expect(mapUnitTypeToSunat('LT')).toBe('LTR');
      expect(mapUnitTypeToSunat('LTR')).toBe('LTR');
      expect(mapUnitTypeToSunat('LITRO')).toBe('LTR');

      expect(mapUnitTypeToSunat('SA')).toBe('SA');
      expect(mapUnitTypeToSunat('SACO')).toBe('SA');

      expect(mapUnitTypeToSunat('BX')).toBe('BX');
      expect(mapUnitTypeToSunat('CAJA')).toBe('BX');

      expect(mapUnitTypeToSunat('PK')).toBe('PK');
      expect(mapUnitTypeToSunat('PAQUETE')).toBe('PK');

      expect(mapUnitTypeToSunat('DZN')).toBe('DZN');
      expect(mapUnitTypeToSunat('DOCENA')).toBe('DZN');
    });

    it('debe recurrir estrictamente a NIU ante valores nulos, vacíos o unidades no homologadas para evitar observaciones de SUNAT', () => {
      expect(mapUnitTypeToSunat(null)).toBe('NIU');
      expect(mapUnitTypeToSunat(undefined)).toBe('NIU');
      expect(mapUnitTypeToSunat('')).toBe('NIU');
      expect(mapUnitTypeToSunat('   ')).toBe('NIU');
      expect(mapUnitTypeToSunat('CODIGO_INEXISTENTE')).toBe('NIU');
      expect(mapUnitTypeToSunat('INVALIDO_123')).toBe('NIU');
    });
  });

  describe('BillingService resolver', () => {
    it('debe utilizar por defecto el driver MOCK', () => {
      expect(billingService.getActiveDriverName()).toBe('MOCK');
    });

    it('debe canalizar la emisión a través del driver activo retornando status SIMULATED', async () => {
      const result = await billingService.issueReceipt({
        receiptType: 'BOLETA',
        series: 'B002',
        correlativeNumber: 1,
        totalAmount: 50.0,
        taxableBase: 42.37,
        igvAmount: 7.63,
        customerName: 'Cliente Varios',
        customerDocument: null,
        paymentMethod: 'CASH',
        items: [{ name: 'Gaseosa 1.5L', quantity: 5, unitPrice: 10, subtotal: 50 }],
      });

      expect(result.success).toBe(true);
      expect(result.emissionStatus).toBe('SIMULATED');
      expect(result.qrString).toContain('|B002|00000001|');
    });

    it('debe retornar status PENDING y success false si Nubefact falla por red (sin falsear con MOCK)', async () => {
      process.env.BILLING_DRIVER = 'NUBEFACT';
      process.env.NUBEFACT_URL = 'https://api.nubefact.com/api/v1/fail-test';
      process.env.NUBEFACT_TOKEN = 'test-token';

      const failingService = new BillingService(mockDriver, nubefactDriver);
      expect(failingService.getActiveDriverName()).toBe('NUBEFACT');

      const origFetch = global.fetch;
      global.fetch = (async () => {
        throw new Error('Network connection timeout');
      }) as any;

      try {
        const result = await failingService.issueReceipt({
          receiptType: 'BOLETA',
          series: 'B001',
          correlativeNumber: 10,
          totalAmount: 100,
          taxableBase: 84.75,
          igvAmount: 15.25,
          customerName: 'Cliente Prueba',
          paymentMethod: 'CASH',
          items: [{ name: 'Item', quantity: 1, unitPrice: 100, subtotal: 100 }],
        });

        expect(result.success).toBe(false);
        expect(result.emissionStatus).toBe('PENDING');
        expect(result.message).toContain('Falla de comunicación con PSE Nubefact');
      } finally {
        global.fetch = origFetch;
        delete process.env.BILLING_DRIVER;
        delete process.env.NUBEFACT_URL;
        delete process.env.NUBEFACT_TOKEN;
      }
    });
  });
});
