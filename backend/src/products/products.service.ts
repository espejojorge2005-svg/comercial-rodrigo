import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Role, Prisma, MovementType, UnitType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { BulkImportProductsDto } from './dto/bulk-import-product.dto.js';
import { buildPeruDateTimeFilter } from '../reports/reports.service.js';
import { formatPeruYMD, isDiscreteUnit } from '../sales/utils/sales-fiscal.util.js';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Obtiene catálogo de productos con FILTRADO ESTRICTO DE COSTOS POR ROL y filtros avanzados
   */
  async getProducts(
    userRole: Role,
    searchOrOptions?:
      | string
      | {
          search?: string;
          categoryId?: string;
          expirationStatus?: string;
          sortBy?: string;
          page?: number;
          limit?: number;
        },
    categoryId?: string,
    expirationStatus?: string,
    sortBy?: string,
    page?: number,
    limit?: number,
  ) {
    let search: string | undefined;
    let catId: string | undefined;
    let expStatus: string | undefined;
    let sort: string | undefined;
    let pageNum: number | undefined;
    let limitNum: number | undefined;

    if (typeof searchOrOptions === 'object' && searchOrOptions !== null) {
      search = searchOrOptions.search;
      catId = searchOrOptions.categoryId;
      expStatus = searchOrOptions.expirationStatus;
      sort = searchOrOptions.sortBy;
      pageNum = searchOrOptions.page;
      limitNum = searchOrOptions.limit;
    } else {
      search = searchOrOptions;
      catId = categoryId;
      expStatus = expirationStatus;
      sort = sortBy;
      pageNum = page;
      limitNum = limit;
    }

    const where: Prisma.ProductWhereInput = {
      isActive: true,
    };

    if (catId && catId !== 'all') {
      where.categoryId = catId;
    }

    if (search && search.trim() !== '') {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Inicio del día calendario en Perú (America/Lima) expresado en medianoche UTC (YYYY-MM-DDT00:00:00Z)
    // para evitar adelantar el vencimiento a las 7:00 PM hora peruana.
    const peruTodayYmd = formatPeruYMD(new Date());
    const todayStart = new Date(`${peruTodayYmd}T00:00:00.000Z`);
    const in15Days = new Date(todayStart.getTime() + 15 * 24 * 60 * 60 * 1000);
    const in30Days = new Date(todayStart.getTime() + 30 * 24 * 60 * 60 * 1000);

    if (expStatus === 'expired') {
      where.expirationDate = { lt: todayStart };
    } else if (expStatus === 'expiring_soon_15') {
      where.expirationDate = { gte: todayStart, lte: in15Days };
    } else if (expStatus === 'expiring_soon' || expStatus === 'expiring_soon_30') {
      where.expirationDate = { gte: todayStart, lte: in30Days };
    } else if (expStatus === 'with_expiration') {
      where.expirationDate = { not: null };
    } else if (expStatus === 'without_expiration') {
      where.expirationDate = null;
    }

    let orderBy: Prisma.ProductOrderByWithRelationInput | Prisma.ProductOrderByWithRelationInput[] = { name: 'asc' };
    if (sort === 'expiration_asc') {
      orderBy = [
        { expirationDate: { sort: 'asc', nulls: 'last' } },
        { name: 'asc' },
      ];
    } else if (sort === 'expiration_desc') {
      orderBy = [
        { expirationDate: { sort: 'desc', nulls: 'last' } },
        { name: 'asc' },
      ];
    } else if (sort === 'stock_asc') {
      orderBy = { currentStock: 'asc' };
    } else if (sort === 'stock_desc') {
      orderBy = { currentStock: 'desc' };
    } else if (sort === 'name_asc') {
      orderBy = { name: 'asc' };
    }

    const isPaginated = pageNum !== undefined && pageNum !== null;
    const pageNumber = Math.max(1, Number(pageNum) || 1);
    const pageSize = Math.min(5000, Math.max(1, Number(limitNum) || 25));
    const skip = isPaginated ? (pageNumber - 1) * pageSize : undefined;
    const take = isPaginated ? pageSize : undefined;

    const [total, products] = await Promise.all([
      isPaginated ? this.prisma.product.count({ where }) : Promise.resolve(0),
      this.prisma.product.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
        },
        orderBy,
        ...(skip !== undefined ? { skip } : {}),
        ...(take !== undefined ? { take } : {}),
      }),
    ]);

    // 🛡️ REGLA DE SEGURIDAD ESTRICTA:
    // Si el usuario es CAJERO, eliminamos totalmente el campo `costPrice`
    const mapped = products.map((p) => {
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
        expirationDate: p.expirationDate ? p.expirationDate.toISOString() : null,
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

    if (isPaginated) {
      return {
        data: mapped,
        meta: {
          total,
          page: pageNumber,
          limit: pageSize,
          totalPages: Math.ceil(total / pageSize) || 1,
          hasNextPage: pageNumber * pageSize < total,
          hasPrevPage: pageNumber > 1,
        },
      };
    }

    return mapped;
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
      expirationDate: product.expirationDate ? product.expirationDate.toISOString() : null,
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
    const cleanBarcode = dto.barcode ? dto.barcode.trim() : null;
    if (cleanBarcode) {
      const existing = await this.prisma.product.findUnique({
        where: { barcode: cleanBarcode },
      });
      if (existing) {
        throw new BadRequestException('Ya existe un producto registrado con este código de barras');
      }
    }

    if (isDiscreteUnit(dto.unitType) && !Number.isInteger(dto.currentStock)) {
      throw new BadRequestException(
        `El stock inicial debe ser un número entero para unidades discretas (${dto.unitType}).`,
      );
    }

    const roundedStock = Number(dto.currentStock.toFixed(3));

    try {
      return await this.prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            barcode: cleanBarcode,
            name: dto.name.trim(),
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
            currentStock: new Prisma.Decimal(roundedStock),
            minStock: new Prisma.Decimal(dto.minStock),
            expirationDate: dto.expirationDate ? new Date(dto.expirationDate) : null,
          },
        });

        // Si se crea con stock inicial, registrar en Kardex como inventario inicial / compra
        if (roundedStock > 0) {
          await tx.kardexMovement.create({
            data: {
              productId: product.id,
              movementType: MovementType.PURCHASE,
              quantity: new Prisma.Decimal(roundedStock),
              previousStock: new Prisma.Decimal(0),
              newStock: new Prisma.Decimal(roundedStock),
              unitCost: new Prisma.Decimal(dto.costPrice),
              reason: 'Inventario inicial / Compra registrada',
              userId,
            },
          });
        }

        return product;
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new BadRequestException('Ya existe un producto registrado con este código de barras');
      }
      throw error;
    }
  }

  /**
   * Importación Masiva de Productos desde Excel (Solo ADMIN)
   * - Autogenera código/barcode único si está vacío (ej. CR-000001)
   * - Autocrea o asocia categorías
   * - Registra inventario inicial en Kardex
   * - Soporta actualización de stock/precios si el producto ya existe
   */
  async bulkImportProducts(dto: BulkImportProductsDto, userId: string) {
    if (!dto.products || dto.products.length === 0) {
      throw new BadRequestException('El archivo no contiene productos para importar');
    }

    // 1. Obtener categorías existentes y crear mapa
    const existingCategories = await this.prisma.category.findMany();
    const categoryMap = new Map<string, string>();
    for (const c of existingCategories) {
      categoryMap.set(c.name.trim().toLowerCase(), c.id);
    }

    let defaultCategoryId = categoryMap.get('general') || categoryMap.get('abarrotes');
    if (!defaultCategoryId) {
      if (existingCategories.length > 0) {
        defaultCategoryId = existingCategories[0].id;
      } else {
        const def = await this.prisma.category.create({
          data: { name: 'General', description: 'Categoría general' },
        });
        defaultCategoryId = def.id;
        categoryMap.set('general', def.id);
      }
    }

    // 2. Obtener códigos de barras existentes y calcular siguiente secuencia CR-
    const existingProducts = await this.prisma.product.findMany({
      select: { id: true, barcode: true, name: true, currentStock: true, costPrice: true },
    });

    const usedBarcodes = new Set<string>();
    const existingBarcodeMap = new Map<string, (typeof existingProducts)[0]>();
    const existingNameMap = new Map<string, (typeof existingProducts)[0]>();

    let nextBarcodeSeq = 1;

    for (const p of existingProducts) {
      if (p.barcode) {
        const cleanB = p.barcode.trim();
        usedBarcodes.add(cleanB.toLowerCase());
        existingBarcodeMap.set(cleanB.toLowerCase(), p);
        const match = cleanB.match(/^CR-(\d+)$/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num >= nextBarcodeSeq) nextBarcodeSeq = num + 1;
        }
      }
      existingNameMap.set(p.name.trim().toLowerCase(), p);
    }

    // 3. Procesar en transacción para consistencia
    return this.prisma.$transaction(async (tx) => {
      let createdCount = 0;
      let updatedCount = 0;
      const importedProducts: any[] = [];

      for (const item of dto.products) {
        const trimmedName = item.name ? item.name.trim() : '';
        if (!trimmedName) continue;

        // Categoría
        let categoryId = defaultCategoryId;
        if (item.categoryName && item.categoryName.trim()) {
          const catKey = item.categoryName.trim().toLowerCase();
          if (categoryMap.has(catKey)) {
            categoryId = categoryMap.get(catKey)!;
          } else {
            // Crear categoría al vuelo
            const newCat = await tx.category.create({
              data: {
                name: item.categoryName.trim(),
                description: 'Categoría creada automáticamente desde importación Excel',
              },
            });
            categoryId = newCat.id;
            categoryMap.set(catKey, newCat.id);
          }
        }

        // Código de barras
        let finalBarcode: string | null = null;
        if (item.barcode && item.barcode.trim() !== '') {
          finalBarcode = item.barcode.trim();
        } else {
          // Autogenerar código único CR-XXXXXX
          let candidate = '';
          do {
            candidate = `CR-${String(nextBarcodeSeq++).padStart(6, '0')}`;
          } while (usedBarcodes.has(candidate.toLowerCase()));
          finalBarcode = candidate;
        }

        // Tipo de unidad (por defecto NIU)
        const unitType = item.unitType || UnitType.NIU;
        const costPrice = new Prisma.Decimal(item.costPrice >= 0 ? item.costPrice : 0);
        const retailPrice = new Prisma.Decimal(item.retailPrice > 0 ? item.retailPrice : 1);
        const wholesalePrice =
          item.wholesalePrice !== undefined && item.wholesalePrice !== null && item.wholesalePrice >= 0
            ? new Prisma.Decimal(item.wholesalePrice)
            : null;
        const wholesaleMinQty =
          wholesalePrice !== null
            ? item.wholesaleMinQty !== undefined &&
              item.wholesaleMinQty !== null &&
              item.wholesaleMinQty >= 0.001
              ? new Prisma.Decimal(item.wholesaleMinQty)
              : new Prisma.Decimal(3)
            : null;
        const normalizedStock =
          item.currentStock >= 0 ? Number(Number(item.currentStock).toFixed(3)) : 0;
        if (isDiscreteUnit(unitType) && !Number.isInteger(normalizedStock)) {
          throw new BadRequestException(
            `El producto "${trimmedName}" se vende por unidad entera (${unitType}) y no admite stock decimal (${normalizedStock}).`,
          );
        }
        const initialStock = new Prisma.Decimal(normalizedStock);
        const minStock = new Prisma.Decimal(item.minStock >= 0 ? item.minStock : 5);
        const expirationDate = item.expirationDate ? new Date(item.expirationDate) : null;

        // Verificar si ya existe por barcode o por nombre
        const existingByBarcode = finalBarcode ? existingBarcodeMap.get(finalBarcode.toLowerCase()) : null;
        const existingByName = existingNameMap.get(trimmedName.toLowerCase());
        const existingTarget = existingByBarcode || (item.barcode ? null : existingByName);

        if (existingTarget) {
          // Actualizar producto existente
          const updated = await tx.product.update({
            where: { id: existingTarget.id },
            data: {
              name: trimmedName,
              costPrice,
              retailPrice,
              wholesalePrice,
              wholesaleMinQty,
              minStock,
              unitType,
              categoryId,
              isActive: true,
              ...(expirationDate ? { expirationDate } : {}),
            },
          });

          // Si el Excel define stock y difiere del actual, generar ajuste en Kardex
          const currentStockNum = Number(existingTarget.currentStock);
          const newStockNum = Number(initialStock);
          const diff = Number((newStockNum - currentStockNum).toFixed(3));
          if (Math.abs(diff) > 0) {
            await tx.product.update({
              where: { id: existingTarget.id },
              data: { currentStock: initialStock },
            });

            await tx.kardexMovement.create({
              data: {
                productId: updated.id,
                movementType: diff > 0 ? MovementType.ADJUSTMENT_IN : MovementType.ADJUSTMENT_OUT,
                quantity: new Prisma.Decimal(Math.abs(diff)),
                previousStock: new Prisma.Decimal(currentStockNum),
                newStock: initialStock,
                unitCost: costPrice,
                reason: `Ajuste por importación masiva Excel (${diff > 0 ? '+' : ''}${diff})`,
                userId,
              },
            });
            existingTarget.currentStock = initialStock;
          }

          updatedCount++;
          importedProducts.push(updated);
        } else {
          // Crear nuevo producto
          const created = await tx.product.create({
            data: {
              barcode: finalBarcode,
              name: trimmedName,
              categoryId,
              unitType,
              costPrice,
              retailPrice,
              wholesalePrice,
              wholesaleMinQty,
              currentStock: initialStock,
              minStock,
              expirationDate,
              isActive: true,
            },
          });

          // Registrar en Kardex si tiene stock inicial
          if (Number(initialStock) > 0) {
            await tx.kardexMovement.create({
              data: {
                productId: created.id,
                movementType: MovementType.PURCHASE,
                quantity: initialStock,
                previousStock: new Prisma.Decimal(0),
                newStock: initialStock,
                unitCost: costPrice,
                reason: 'Inventario inicial (Importación masiva Excel)',
                userId,
              },
            });
          }

          if (finalBarcode) {
            usedBarcodes.add(finalBarcode.toLowerCase());
            existingBarcodeMap.set(finalBarcode.toLowerCase(), created);
          }
          existingNameMap.set(trimmedName.toLowerCase(), created);

          createdCount++;
          importedProducts.push(created);
        }
      }

      return {
        message: `Importación completada: ${createdCount} productos nuevos creados, ${updatedCount} productos actualizados.`,
        createdCount,
        updatedCount,
        totalProcessed: createdCount + updatedCount,
      };
    }, { maxWait: 10000, timeout: 60000 });
  }

  /**
   * Actualización de producto (Solo ADMIN)
   */
  async updateProduct(id: string, dto: UpdateProductDto, userId: string) {
    try {
      // Lectura y escritura atómica dentro de la transacción para evitar pérdidas de stock concurrentes
      return await this.prisma.$transaction(async (tx) => {
        const product = await tx.product.findUnique({ where: { id } });
        if (!product) throw new NotFoundException('Producto no encontrado');

        const data: Prisma.ProductUpdateInput = {};

        if (dto.barcode !== undefined) {
          const cleanBarcode = dto.barcode ? dto.barcode.trim() : null;
          if (cleanBarcode && cleanBarcode !== product.barcode) {
            const duplicate = await tx.product.findFirst({
              where: { barcode: cleanBarcode, id: { not: id } },
            });
            if (duplicate) {
              throw new BadRequestException(
                'Ya existe otro producto registrado con este código de barras',
              );
            }
          }
          data.barcode = cleanBarcode;
        }
        if (dto.name !== undefined) data.name = dto.name.trim();
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
        if (dto.expirationDate !== undefined) {
          data.expirationDate = dto.expirationDate ? new Date(dto.expirationDate) : null;
        }

        const effectiveUnitType = dto.unitType ?? product.unitType;

        // Si hay ajuste manual de stock, validar unidad y registrarlo en Kardex
        if (dto.currentStock !== undefined) {
          if (effectiveUnitType && isDiscreteUnit(effectiveUnitType) && !Number.isInteger(dto.currentStock)) {
            throw new BadRequestException(
              `El stock debe ser un número entero para unidades discretas (${effectiveUnitType}).`,
            );
          }

          const newStockRounded = Number(dto.currentStock.toFixed(3));
          const prevStockNum = Number(product.currentStock);
          const diff = Number((newStockRounded - prevStockNum).toFixed(3));

          if (Math.abs(diff) > 0) {
            data.currentStock = new Prisma.Decimal(newStockRounded);

            await tx.kardexMovement.create({
              data: {
                productId: product.id,
                movementType: diff > 0 ? MovementType.ADJUSTMENT_IN : MovementType.ADJUSTMENT_OUT,
                quantity: new Prisma.Decimal(Math.abs(diff)),
                previousStock: product.currentStock,
                newStock: new Prisma.Decimal(newStockRounded),
                unitCost: dto.costPrice !== undefined ? new Prisma.Decimal(dto.costPrice) : product.costPrice,
                reason: `Ajuste manual de inventario (${diff > 0 ? '+' : ''}${diff})`,
                userId,
              },
            });
          }
        }

        return tx.product.update({
          where: { id },
          data,
        });
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new BadRequestException('Ya existe un producto registrado con este código de barras');
      }
      throw error;
    }
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
   * Soporta filtro por rango de fechas y producto sin truncamiento arbitrario
   */
  async getKardex(
    productId?: string,
    filter?: { startDate?: string; endDate?: string; limit?: number },
  ) {
    const where: Prisma.KardexMovementWhereInput = {};
    if (productId && productId !== 'all') {
      where.productId = productId;
    }

    const dateFilter = buildPeruDateTimeFilter(filter?.startDate, filter?.endDate);
    if (dateFilter) {
      where.createdAt = dateFilter;
    }

    const take = filter?.limit
      ? filter.limit
      : !filter?.startDate && !filter?.endDate
        ? 200
        : undefined;

    const movements = await this.prisma.kardexMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...(take !== undefined ? { take } : {}),
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

  /**
   * Resumen y valorización global del almacén (Solo ADMIN)
   * Devuelve métricas calculadas sobre el 100% de productos activos
   * sin distorsiones por paginación o filtros de vista.
   */
  async getInventorySummary() {
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true,
        costPrice: true,
        retailPrice: true,
        currentStock: true,
        minStock: true,
        expirationDate: true,
      },
    });

    const peruTodayYmd = formatPeruYMD(new Date());
    const todayStart = new Date(`${peruTodayYmd}T00:00:00.000Z`);
    const in30Days = new Date(todayStart.getTime() + 30 * 24 * 60 * 60 * 1000);

    let totalStockUnits = 0;
    let totalValuedCost = 0;
    let totalValuedRetail = 0;
    let lowStockCount = 0;
    let expiredCount = 0;
    let expiringSoonCount = 0;
    let sumMarkup = 0;
    let validCostCount = 0;

    for (const p of products) {
      const stock = Number(p.currentStock);
      const cost = Number(p.costPrice);
      const retail = Number(p.retailPrice);
      const minStock = Number(p.minStock);

      totalStockUnits += stock;
      totalValuedCost += stock * cost;
      totalValuedRetail += stock * retail;

      if (stock <= minStock) lowStockCount++;

      if (p.expirationDate) {
        if (p.expirationDate < todayStart) {
          expiredCount++;
        } else if (p.expirationDate <= in30Days) {
          expiringSoonCount++;
        }
      }

      if (cost > 0) {
        sumMarkup += ((retail - cost) / cost) * 100;
        validCostCount++;
      }
    }

    return {
      totalProducts: products.length,
      totalStockUnits: Number(totalStockUnits.toFixed(3)),
      totalValuedCost: Number(totalValuedCost.toFixed(2)),
      totalValuedRetail: Number(totalValuedRetail.toFixed(2)),
      lowStockCount,
      expiredCount,
      expiringSoonCount,
      avgMarkupPercent: validCostCount > 0 ? Number((sumMarkup / validCostCount).toFixed(1)) : 0,
    };
  }
}
