import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsService } from './settings.service.js';

describe('SettingsService', () => {
  let service: SettingsService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      storeConfig: {
        findUnique: vi.fn(),
        create: vi.fn(),
        upsert: vi.fn(),
      },
    };

    service = new SettingsService(mockPrisma);
  });

  describe('getSettings', () => {
    it('debe retornar la configuración comercial si ya existe', async () => {
      const mockConfig = {
        id: 'default',
        name: 'COMERCIAL RODRIGO',
        subtitle: 'VENTA POR MAYOR Y MENOR',
        ruc: '10458923011',
        phone: '(01) 987-654-321',
        address: 'Av. Principal 1234, Lima',
        footerText: '¡Gracias por su compra!',
      };
      mockPrisma.storeConfig.findUnique.mockResolvedValue(mockConfig);

      const result = await service.getSettings();

      expect(result).toEqual(mockConfig);
      expect(mockPrisma.storeConfig.create).not.toHaveBeenCalled();
    });

    it('debe crear la configuración por defecto si no existe en la base de datos', async () => {
      mockPrisma.storeConfig.findUnique.mockResolvedValue(null);
      const createdConfig = {
        id: 'default',
        name: 'COMERCIAL RODRIGO',
        subtitle: 'VENTA POR MAYOR Y MENOR',
        ruc: '10458923011',
      };
      mockPrisma.storeConfig.create.mockResolvedValue(createdConfig);

      const result = await service.getSettings();

      expect(result).toEqual(createdConfig);
      expect(mockPrisma.storeConfig.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            id: 'default',
            name: 'COMERCIAL RODRIGO',
          }),
        }),
      );
    });
  });

  describe('updateSettings', () => {
    it('debe actualizar los datos comerciales recortando espacios en blanco', async () => {
      const updatedConfig = {
        id: 'default',
        name: 'COMERCIAL RODRIGO S.A.C.',
        ruc: '20601234567',
      };
      mockPrisma.storeConfig.upsert.mockResolvedValue(updatedConfig);

      const result = await service.updateSettings({
        name: '  COMERCIAL RODRIGO S.A.C.  ',
        ruc: ' 20601234567 ',
        phone: ' 999888777 ',
      });

      expect(result).toEqual(updatedConfig);
      expect(mockPrisma.storeConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'default' },
          update: expect.objectContaining({
            name: 'COMERCIAL RODRIGO S.A.C.',
            ruc: '20601234567',
            phone: '999888777',
          }),
        }),
      );
    });
  });
});
