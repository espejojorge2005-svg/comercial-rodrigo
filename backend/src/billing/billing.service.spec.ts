import { describe, it, expect, beforeEach } from 'vitest';
import { MockBillingDriver } from './drivers/mock-billing.driver.js';
import {
  NubefactBillingDriver,
  mapUnitTypeToSunat,
  buildNubefactAuthHeader,
  sanitizeNubefactText,
  mapPaymentMethodToNubefact,
} from './drivers/nubefact-billing.driver.js';
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

    it('debe rechazar formalmente si Nubefact responde HTTP 200 pero aceptada_por_sunat es false', async () => {
      process.env.NUBEFACT_URL = 'https://api.nubefact.com/api/v1/mock-test';
      process.env.NUBEFACT_TOKEN = 'test-token-123';

      const originalFetch = global.fetch;
      global.fetch = (async () => ({
        ok: true,
        json: async () => ({
          aceptada_por_sunat: false,
          sunat_description: 'El RUC del receptor no se encuentra activo o habido ante SUNAT',
          sunat_responsecode: '2024',
        }),
      })) as any;

      try {
        const result = await nubefactDriver.issueReceipt({
          receiptType: 'FACTURA',
          series: 'F001',
          correlativeNumber: 10,
          totalAmount: 118,
          taxableBase: 100,
          igvAmount: 18,
          customerName: 'EMPRESA INACTIVA SAC',
          customerDocument: '20100070970',
          customerAddress: 'Av. Test 123',
          paymentMethod: 'CASH',
          items: [{ name: 'Producto A', quantity: 1, unitPrice: 118, subtotal: 118 }],
        });

        expect(result.success).toBe(false);
        expect(result.emissionStatus).toBe('REJECTED');
        expect(result.message).toContain('Rechazado por SUNAT');
        expect(result.message).toContain('no se encuentra activo');
      } finally {
        global.fetch = originalFetch;
        delete process.env.NUBEFACT_URL;
        delete process.env.NUBEFACT_TOKEN;
      }
    });

    it('debe enviar cliente_tipo_de_documento entero (6/1), medio_de_pago, sanitizar pipes y preservar precisión decimal en pesajes (0.333 kg)', async () => {
      process.env.NUBEFACT_URL = 'https://api.nubefact.com/api/v1/mock-test';
      process.env.NUBEFACT_TOKEN = 'test-token-123';

      let capturedPayload: any = null;
      const originalFetch = global.fetch;
      global.fetch = (async (_url: any, options: any) => {
        capturedPayload = JSON.parse(options.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            aceptada_por_sunat: true,
            codigo_hash: 'HashFacturaOk=',
            cadena_para_codigo_qr: 'QR-FACTURA-OK',
            enlace_del_pdf: 'https://nubefact.com/pdf/f001-25.pdf',
          }),
        } as any;
      }) as any;

      try {
        await nubefactDriver.issueReceipt({
          receiptType: 'FACTURA',
          series: 'F001',
          correlativeNumber: 25,
          totalAmount: 2008.33,
          taxableBase: 1701.97,
          igvAmount: 306.36,
          customerName: 'CORPORACION | SUR\nS.A.C.',
          customerDocument: '20100070970',
          customerAddress: 'Av. Principal | Lote 4\tLima',
          customerEmail: 'correo_malformado_sin_dominio@',
          paymentMethod: 'TRANSFER',
          items: [
            {
              name: 'Queso Paria | Fresco',
              barcode: '7750001',
              quantity: 0.333,
              unitPrice: 25.0,
              subtotal: 8.33,
              unitType: 'KG',
            },
            {
              name: 'Saco Azúcar Rubia 50kg',
              barcode: '7750002',
              quantity: 10,
              unitPrice: 200.0,
              subtotal: 2000.0,
              unitType: 'SA',
            },
          ],
        });

        expect(capturedPayload.cliente_tipo_de_documento).toBe(6); // Entero estricto Nubefact
        expect(capturedPayload.condiciones_de_pago).toBe('CONTADO');
        expect(capturedPayload.medio_de_pago).toBe('TRANSFERENCIA / BILLETERA DIGITAL');
        // Sanitización de pipes y saltos de línea
        expect(capturedPayload.cliente_denominacion).toBe('CORPORACION - SUR S.A.C.');
        expect(capturedPayload.cliente_direccion).toBe('Av. Principal - Lote 4 Lima');
        expect(capturedPayload.items[0].descripcion).toBe('Queso Paria - Fresco');
        expect(capturedPayload.items[0].codigo).toBe('7750001');
        // Email malformado neutralizado para evitar rechazo HTTP 400 en Nubefact
        expect(capturedPayload.cliente_email).toBe('');
        expect(capturedPayload.enviar_automaticamente_al_cliente).toBe(false);
        // Precisión exacta de precio_unitario en pesajes fraccionados (8.33 / 0.333 = 25.015015015)
        expect(
          Number((capturedPayload.items[0].precio_unitario * capturedPayload.items[0].cantidad).toFixed(2)),
        ).toBe(8.33);
      } finally {
        global.fetch = originalFetch;
        delete process.env.NUBEFACT_URL;
        delete process.env.NUBEFACT_TOKEN;
      }
    });

    it('debe preservar PENDING con hash y PDF cuando Nubefact firma el XML pero SUNAT aún procesa en cola asíncrona (aceptada_por_sunat: false sin código 2000-3999)', async () => {
      process.env.NUBEFACT_URL = 'https://api.nubefact.com/api/v1/mock-test';
      process.env.NUBEFACT_TOKEN = 'test-token-123';

      const originalFetch = global.fetch;
      global.fetch = (async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          aceptada_por_sunat: false,
          sunat_responsecode: null,
          sunat_description: null,
          codigo_hash: 'HashEnCola123=',
          cadena_para_codigo_qr: 'QR-EN-COLA',
          enlace_del_pdf: 'https://nubefact.com/pdf/b001-77.pdf',
          enlace_del_xml: 'https://nubefact.com/xml/b001-77.xml',
        }),
      })) as any;

      try {
        const res = await nubefactDriver.issueReceipt({
          receiptType: 'BOLETA',
          series: 'B001',
          correlativeNumber: 77,
          totalAmount: 50,
          taxableBase: 42.37,
          igvAmount: 7.63,
          customerName: 'Clientes Varios',
          paymentMethod: 'CASH',
          items: [{ name: 'Gaseosa', quantity: 5, unitPrice: 10, subtotal: 50 }],
        });

        expect(res.success).toBe(false);
        expect(res.emissionStatus).toBe('PENDING');
        expect(res.hash).toBe('HashEnCola123=');
        expect(res.pdfUrl).toBe('https://nubefact.com/pdf/b001-77.pdf');
      } finally {
        global.fetch = originalFetch;
        delete process.env.NUBEFACT_URL;
        delete process.env.NUBEFACT_TOKEN;
      }
    });

    it('debe ejecutar consultar_comprobante automáticamente cuando Nubefact responde código 23 (Este documento ya existe en NubeFacT)', async () => {
      process.env.NUBEFACT_URL = 'https://api.nubefact.com/api/v1/mock-test';
      process.env.NUBEFACT_TOKEN = 'test-token-123';

      const calls: any[] = [];
      const originalFetch = global.fetch;
      global.fetch = (async (_url: any, options: any) => {
        const body = JSON.parse(options.body);
        calls.push(body);
        if (body.operacion === 'generar_comprobante') {
          return {
            ok: false,
            status: 400,
            json: async () => ({
              errors: 'Este documento ya existe en NubeFacT',
              codigo: 23,
            }),
          } as any;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            aceptada_por_sunat: true,
            codigo_hash: 'HashRecuperado23=',
            cadena_para_codigo_qr: 'QR-RECUPERADO-23',
            enlace_del_pdf: 'https://nubefact.com/pdf/recuperado.pdf',
            enlace_del_cdr: 'https://nubefact.com/cdr/recuperado.zip',
          }),
        } as any;
      }) as any;

      try {
        const res = await nubefactDriver.issueReceipt({
          receiptType: 'FACTURA',
          series: 'F001',
          correlativeNumber: 15,
          totalAmount: 590,
          taxableBase: 500,
          igvAmount: 90,
          customerName: 'DISTRIBUIDORA NORTE S.A.C.',
          customerDocument: '20100070970',
          customerAddress: 'Av. Industrial 100',
          paymentMethod: 'CARD',
          items: [{ name: 'Producto', quantity: 1, unitPrice: 590, subtotal: 590 }],
        });

        expect(calls).toHaveLength(2);
        expect(calls[0].operacion).toBe('generar_comprobante');
        expect(calls[1].operacion).toBe('consultar_comprobante');
        expect(calls[1].serie).toBe('F001');
        expect(calls[1].numero).toBe(15);
        expect(res.success).toBe(true);
        expect(res.emissionStatus).toBe('ACCEPTED');
        expect(res.hash).toBe('HashRecuperado23=');
        expect(res.cdrUrl).toBe('https://nubefact.com/cdr/recuperado.zip');
      } finally {
        global.fetch = originalFetch;
        delete process.env.NUBEFACT_URL;
        delete process.env.NUBEFACT_TOKEN;
      }
    });

    it('sanitizeNubefactText y mapPaymentMethodToNubefact deben formatear campos oficiales', () => {
      expect(sanitizeNubefactText('Azúcar | Rubia\r\n50kg')).toBe('Azúcar - Rubia 50kg');
      expect(mapPaymentMethodToNubefact('CASH')).toBe('EFECTIVO');
      expect(mapPaymentMethodToNubefact('CARD')).toBe('TARJETA DE DEBITO / CREDITO');
      expect(mapPaymentMethodToNubefact('MIXED')).toBe('PAGO MIXTO (CONTADO)');
    });
  });

  describe('buildNubefactAuthHeader (Formato Oficial Token token="...")', () => {
    it('debe estructurar cabecera requerida por Nubefact a partir de token crudo o prefijado', () => {
      expect(buildNubefactAuthHeader('my-secret-token-123')).toBe('Token token="my-secret-token-123"');
      expect(buildNubefactAuthHeader('Bearer my-secret-token-123')).toBe('Token token="my-secret-token-123"');
      expect(buildNubefactAuthHeader('Token token="my-secret-token-123"')).toBe('Token token="my-secret-token-123"');
      expect(buildNubefactAuthHeader('"my-secret-token-123"')).toBe('Token token="my-secret-token-123"');
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
