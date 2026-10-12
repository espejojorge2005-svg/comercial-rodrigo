import { describe, it, expect, beforeEach } from 'vitest';
import { MockBillingDriver } from './drivers/mock-billing.driver.js';
import { NubefactBillingDriver } from './drivers/nubefact-billing.driver.js';
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
  });
});
