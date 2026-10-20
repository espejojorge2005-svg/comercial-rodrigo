import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProductsService } from './products.service.js';
import { Role, MovementType, UnitType, Prisma } from '@prisma/client';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('ProductsService', () => {
  let service: ProductsService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      product: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      category: {
        findMany: vi.fn(),
        create: vi.fn(),
      },
      kardexMovement: {
        create: vi.fn(),
        findMany: vi.fn(),
      },
      $transaction: vi.fn(async (cb) => cb(mockPrisma)),
    };

    service = new ProductsService(mockPrisma);
  });

  describe('Ocultamiento de Costos por Rol (Seguridad Financiera)', () => {
    const rawProduct = {
      id: 'prod-1',
      barcode: '7751234567890',
      name: 'Arroz Costeño 1kg',
      categoryId: 'cat-1',
      category: { id: 'cat-1', name: 'Abarrotes' },
      unitType: UnitType.NIU,
      costPrice: new Prisma.Decimal(3.5),
      retailPrice: new Prisma.Decimal(4.8),
      wholesalePrice: new Prisma.Decimal(4.3),
      wholesaleMinQty: new Prisma.Decimal(12),
      currentStock: new Prisma.Decimal(100),
      minStock: new Prisma.Decimal(10),
      isActive: true,
      expirationDate: null,
    };

    it('debe OMITIR el precio de costo (costPrice) para usuarios con rol CAJERO', async () => {
      mockPrisma.product.findFirst.mockResolvedValue(rawProduct);

      const product = await service.getProductById('prod-1', Role.CAJERO);

      expect(product).toHaveProperty('id', 'prod-1');
      expect(product).toHaveProperty('retailPrice', 4.8);
      expect((product as any).costPrice).toBeUndefined();
    });

    it('debe INCLUIR el precio de costo (costPrice) para usuarios con rol ADMIN', async () => {
      mockPrisma.product.findFirst.mockResolvedValue(rawProduct);

      const product = await service.getProductById('prod-1', Role.ADMIN);

      expect(product).toHaveProperty('costPrice', 3.5);
      expect(product).toHaveProperty('retailPrice', 4.8);
    });

    it('en getProducts para CAJERO no debe exponer márgenes ni costo', async () => {
      mockPrisma.product.findMany.mockResolvedValue([rawProduct]);

      const products = await service.getProducts(Role.CAJERO);

      expect(products).toHaveLength(1);
      expect((products[0] as any).costPrice).toBeUndefined();
      expect((products[0] as any).marginRetailPercent).toBeUndefined();
    });

    it('en getProducts para ADMIN debe calcular márgenes de ganancia', async () => {
      mockPrisma.product.findMany.mockResolvedValue([rawProduct]);

      const products = await service.getProducts(Role.ADMIN);

      expect(products).toHaveLength(1);
      expect(products[0]).toHaveProperty('costPrice', 3.5);
      expect(products[0]).toHaveProperty('marginRetailPercent');
      // Retail 4.8, Cost 3.5 -> ((4.8 - 3.5)/3.5)*100 = ~37.1%
      expect(products[0].marginRetailPercent).toBeCloseTo(37.1, 1);
    });
  });

  describe('createProduct (Validación & Kardex Inicial)', () => {
    it('debe rechazar la creación si el código de barras ya existe', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'existing-id' });

      await expect(
        service.createProduct(
          {
            barcode: '7750000000001',
            name: 'Aceite Primor 1L',
            categoryId: 'cat-1',
            unitType: UnitType.NIU,
            costPrice: 8.0,
            retailPrice: 11.5,
            currentStock: 20,
            minStock: 5,
          },
          'admin-user-id',
        ),
      ).rejects.toThrow('Ya existe un producto registrado con este código de barras');
    });

    it('debe crear el producto y generar registro en Kardex cuando tiene stock inicial > 0', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);
      mockPrisma.product.create.mockResolvedValue({
        id: 'new-product-id',
        name: 'Aceite Primor 1L',
        currentStock: 25,
      });

      const result = await service.createProduct(
        {
          barcode: '7759999999999',
          name: 'Aceite Primor 1L',
          categoryId: 'cat-1',
          unitType: UnitType.NIU,
          costPrice: 8.0,
          retailPrice: 11.5,
          currentStock: 25,
          minStock: 5,
        },
        'admin-user-id',
      );

      expect(result.id).toBe('new-product-id');
      expect(mockPrisma.kardexMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productId: 'new-product-id',
          movementType: MovementType.PURCHASE,
          previousStock: expect.any(Prisma.Decimal),
          newStock: expect.any(Prisma.Decimal),
          reason: 'Inventario inicial / Compra registrada',
          userId: 'admin-user-id',
        }),
      });
    });
  });

  describe('updateProduct (Ajuste Manual de Inventario en Kardex)', () => {
    it('debe registrar ADJUSTMENT_IN en Kardex si el stock aumenta manualmente', async () => {
      const currentProduct = {
        id: 'p-1',
        name: 'Azúcar Rubia',
        currentStock: new Prisma.Decimal(50),
        costPrice: new Prisma.Decimal(3.0),
      };
      mockPrisma.product.findUnique.mockResolvedValue(currentProduct);
      mockPrisma.product.update.mockResolvedValue({
        ...currentProduct,
        currentStock: new Prisma.Decimal(60),
      });

      await service.updateProduct('p-1', { currentStock: 60 }, 'admin-id');

      expect(mockPrisma.kardexMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productId: 'p-1',
          movementType: MovementType.ADJUSTMENT_IN,
          quantity: expect.any(Prisma.Decimal),
          newStock: expect.any(Prisma.Decimal),
          reason: 'Ajuste manual de inventario (+10)',
        }),
      });
    });

    it('debe registrar ADJUSTMENT_OUT en Kardex si el stock disminuye manualmente', async () => {
      const currentProduct = {
        id: 'p-1',
        name: 'Azúcar Rubia',
        currentStock: new Prisma.Decimal(50),
        costPrice: new Prisma.Decimal(3.0),
      };
      mockPrisma.product.findUnique.mockResolvedValue(currentProduct);
      mockPrisma.product.update.mockResolvedValue({
        ...currentProduct,
        currentStock: new Prisma.Decimal(45),
      });

      await service.updateProduct('p-1', { currentStock: 45 }, 'admin-id');

      expect(mockPrisma.kardexMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productId: 'p-1',
          movementType: MovementType.ADJUSTMENT_OUT,
          quantity: expect.any(Prisma.Decimal),
          newStock: expect.any(Prisma.Decimal),
          reason: 'Ajuste manual de inventario (-5)',
        }),
      });
    });

    it('debe lanzar NotFoundException si el producto a actualizar no existe', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);

      await expect(
        service.updateProduct('nonexistent', { name: 'Otro' }, 'admin-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('bulkImportProducts (Validaciones de Importación Masiva)', () => {
    it('debe rechazar si la lista de productos viene vacía', async () => {
      await expect(
        service.bulkImportProducts({ products: [] }, 'admin-id'),
      ).rejects.toThrow('El archivo no contiene productos para importar');
    });
  });
});
