import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Role, Prisma, MovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Obtiene catálogo de productos con FILTRADO ESTRICTO DE COSTOS POR ROL
   */
  async getProducts(userRole: Role, search?: string, categoryId?: string) {
    const where: Prisma.ProductWhereInput = {
      isActive: true,
    };

    if (categoryId && categoryId !== 'all') {
      where.categoryId = categoryId;
    }

    if (search && search.trim() !== '') {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
      ];
    }

    const products = await this.prisma.product.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });

    // 🛡️ REGLA DE SEGURIDAD ESTRICTA:
    // Si el usuario es CAJERO, eliminamos totalmente el campo `costPrice`
    return products.map((p) => {
      const baseProduct = {
        id: p.id,
        barcode: p.barcode,
        name: p.name,
        categoryId: p.categoryId,
        category: p.category,
        unitType: p.unitType,
        retailPrice: Number(p.retailPrice),
        wholesalePrice: p.wholesalePrice ? Number(p.wholesalePrice) : null,
        wholesaleMinQty: p.wholesaleMinQty ? Number(p.wholesaleMinQty) : null,
        currentStock: Number(p.currentStock),
        minStock: Number(p.minStock),
        isActive: p.isActive,
      };

      if (userRole === Role.ADMIN) {
        const cost = Number(p.costPrice);
        const retail = Number(p.retailPrice);
        const wholesale = p.wholesalePrice ? Number(p.wholesalePrice) : 0;

        return {
          ...baseProduct,
          costPrice: cost,
          marginRetailPercent: cost > 0 ? Number((((retail - cost) / cost) * 100).toFixed(1)) : 0,
          marginWholesalePercent:
            cost > 0 && wholesale > 0 ? Number((((wholesale - cost) / cost) * 100).toFixed(1)) : 0,
        };
      }

      // Para CAJEROS: sin costo de adquisición ni márgenes
      return baseProduct;
    });
  }

  /**
   * Obtiene un producto individual por ID o código de barras
   */
  async getProductById(idOrBarcode: string, userRole: Role) {
    const product = await this.prisma.product.findFirst({
      where: {
        OR: [{ id: idOrBarcode }, { barcode: idOrBarcode }],
        isActive: true,
      },
      include: { category: true },
    });

    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    const base = {
      id: product.id,
      barcode: product.barcode,
      name: product.name,
      categoryId: product.categoryId,
      category: product.category,
      unitType: product.unitType,
      retailPrice: Number(product.retailPrice),
      wholesalePrice: product.wholesalePrice ? Number(product.wholesalePrice) : null,
      wholesaleMinQty: product.wholesaleMinQty ? Number(product.wholesaleMinQty) : null,
      currentStock: Number(product.currentStock),
      minStock: Number(product.minStock),
      isActive: product.isActive,
    };

    if (userRole === Role.ADMIN) {
      return {
        ...base,
        costPrice: Number(product.costPrice),
      };
    }

    return base;
  }

  /**
   * Obtiene todas las categorías
   */
  async getCategories() {
    return this.prisma.category.findMany({
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Creación de nuevo producto (Solo ADMIN)
   */
  async createProduct(dto: CreateProductDto, userId: string) {
    if (dto.barcode) {
      const existing = await this.prisma.product.findUnique({
        where: { barcode: dto.barcode },
      });
      if (existing) {
        throw new BadRequestException('Ya existe un producto registrado con este código de barras');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          barcode: dto.barcode || null,
          name: dto.name,
          categoryId: dto.categoryId,
          unitType: dto.unitType,
          costPrice: new Prisma.Decimal(dto.costPrice),
          retailPrice: new Prisma.Decimal(dto.retailPrice),
          wholesalePrice:
            dto.wholesalePrice !== undefined && dto.wholesalePrice !== null
              ? new Prisma.Decimal(dto.wholesalePrice)
              : (null as any),
          wholesaleMinQty:
            dto.wholesaleMinQty !== undefined && dto.wholesaleMinQty !== null
              ? new Prisma.Decimal(dto.wholesaleMinQty)
              : (null as any),
          currentStock: new Prisma.Decimal(dto.currentStock),
          minStock: new Prisma.Decimal(dto.minStock),
        },
      });

      // Si se crea con stock inicial, registrar en Kardex como inventario inicial / compra
      if (dto.currentStock > 0) {
        await tx.kardexMovement.create({
          data: {
            productId: product.id,
            movementType: MovementType.PURCHASE,
            quantity: new Prisma.Decimal(dto.currentStock),
            previousStock: new Prisma.Decimal(0),
            newStock: new Prisma.Decimal(dto.currentStock),
            unitCost: new Prisma.Decimal(dto.costPrice),
            reason: 'Inventario inicial / Compra registrada',
            userId,
          },
        });
      }

      return product;
    });
  }

  /**
   * Actualización de producto (Solo ADMIN)
   */
  async updateProduct(id: string, dto: UpdateProductDto, userId: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Producto no encontrado');

    const data: Prisma.ProductUpdateInput = {};

    if (dto.barcode !== undefined) data.barcode = dto.barcode || null;
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.categoryId !== undefined) data.category = { connect: { id: dto.categoryId } };
    if (dto.unitType !== undefined) data.unitType = dto.unitType;
    if (dto.costPrice !== undefined) data.costPrice = new Prisma.Decimal(dto.costPrice);
    if (dto.retailPrice !== undefined) data.retailPrice = new Prisma.Decimal(dto.retailPrice);
    if (dto.wholesalePrice !== undefined)
      data.wholesalePrice =
        dto.wholesalePrice !== null ? new Prisma.Decimal(dto.wholesalePrice) : (null as any);
    if (dto.wholesaleMinQty !== undefined)
      data.wholesaleMinQty =
        dto.wholesaleMinQty !== null ? new Prisma.Decimal(dto.wholesaleMinQty) : (null as any);
    if (dto.minStock !== undefined) data.minStock = new Prisma.Decimal(dto.minStock);
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    // Si hay ajuste manual de stock, registrarlo en Kardex
    if (dto.currentStock !== undefined && dto.currentStock !== Number(product.currentStock)) {
      data.currentStock = new Prisma.Decimal(dto.currentStock);
      const diff = dto.currentStock - Number(product.currentStock);

      await this.prisma.kardexMovement.create({
        data: {
          productId: product.id,
          movementType: diff > 0 ? MovementType.ADJUSTMENT_IN : MovementType.ADJUSTMENT_OUT,
          quantity: new Prisma.Decimal(Math.abs(diff)),
          previousStock: product.currentStock,
          newStock: new Prisma.Decimal(dto.currentStock),
          unitCost: product.costPrice,
          reason: `Ajuste manual de inventario (${diff > 0 ? '+' : ''}${diff})`,
          userId,
        },
      });
    }

    return this.prisma.product.update({
      where: { id },
      data,
    });
  }

  /**
   * Desactivar producto (Eliminación lógica)
   */
  async deleteProduct(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Producto no encontrado');

    return this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * Obtiene historial de movimientos de Kardex (Solo ADMIN)
   */
  async getKardex(productId?: string) {
    const where: Prisma.KardexMovementWhereInput = {};
    if (productId && productId !== 'all') {
      where.productId = productId;
    }

    const movements = await this.prisma.kardexMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        product: { select: { id: true, name: true, barcode: true, unitType: true } },
        user: { select: { id: true, name: true, username: true } },
      },
    });

    return movements.map((m) => ({
      id: m.id,
      productId: m.productId,
      productName: m.product.name,
      barcode: m.product.barcode,
      unitType: m.product.unitType,
      movementType: m.movementType,
      quantity: Number(m.quantity),
      previousStock: Number(m.previousStock),
      newStock: Number(m.newStock),
      unitCost: Number(m.unitCost),
      referenceId: m.referenceId,
      reason: m.reason,
      userName: m.user.name,
      createdAt: m.createdAt,
    }));
  }
}
