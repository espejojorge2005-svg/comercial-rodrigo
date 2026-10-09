import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, ShiftStatus, MovementType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateSaleDto } from './dto/create-sale.dto.js';
import { VoidSaleDto } from './dto/void-sale.dto.js';

@Injectable()
export class SalesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Registro atómico de venta en POS con CONTROL DE CONCURRENCIA ACID y Kardex
   */
  async createSale(userId: string, dto: CreateSaleDto) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('La venta debe incluir al menos un producto');
    }

    // 1. Validar que el turno de caja esté ABIERTO
    const shift = await this.prisma.cashShift.findUnique({
      where: { id: dto.cashShiftId },
      include: { cashRegister: true },
    });

    if (!shift || shift.status !== ShiftStatus.OPEN) {
      throw new BadRequestException('El turno de caja especificado no está abierto');
    }

    // 2. Ejecutar toda la venta en una transacción ACID atómica
    return this.prisma.$transaction(
      async (tx) => {
        let totalCalculated = 0;
        const detailsToCreate: {
          productId: string;
          quantity: Prisma.Decimal;
          unitPrice: Prisma.Decimal;
          subtotal: Prisma.Decimal;
          costPriceSnapshot: Prisma.Decimal;
        }[] = [];

        // Validar stock y preparar cada producto
        for (const item of dto.items) {
          const product = await tx.product.findUnique({
            where: { id: item.productId },
          });

          if (!product || !product.isActive) {
            throw new BadRequestException(
              `El producto con ID ${item.productId} no existe o no está activo`,
            );
          }

          const currentStockNum = Number(product.currentStock);
          if (currentStockNum < item.quantity) {
            throw new BadRequestException(
              `Stock insuficiente para "${product.name}". Solicitado: ${item.quantity}, Disponible: ${currentStockNum}`,
            );
          }

          const subtotalItem = Number((item.quantity * item.unitPrice).toFixed(2));
          totalCalculated += subtotalItem;

          // Descontar stock atómicamente
          const newStock = currentStockNum - item.quantity;
          await tx.product.update({
            where: { id: product.id },
            data: {
              currentStock: new Prisma.Decimal(newStock),
            },
          });

          // Registrar movimiento en Kardex de tipo SALIDA (SALE)
          await tx.kardexMovement.create({
            data: {
              productId: product.id,
              movementType: MovementType.SALE,
              quantity: new Prisma.Decimal(item.quantity),
              previousStock: product.currentStock,
              newStock: new Prisma.Decimal(newStock),
              unitCost: product.costPrice,
              reason: `Venta POS - ${shift.cashRegister.name}`,
              userId,
            },
          });

          detailsToCreate.push({
            productId: product.id,
            quantity: new Prisma.Decimal(item.quantity),
            unitPrice: new Prisma.Decimal(item.unitPrice),
            subtotal: new Prisma.Decimal(subtotalItem),
            costPriceSnapshot: product.costPrice,
          });
        }

        const totalAmountDecimal = new Prisma.Decimal(Number(totalCalculated.toFixed(2)));

        // Crear la Venta y sus Detalles
        const sale = await tx.sale.create({
          data: {
            cashShiftId: shift.id,
            userId,
            customerName: dto.customerName || 'Cliente Varios',
            customerDocument: dto.customerDocument || null,
            paymentMethod: dto.paymentMethod,
            cashPaid: new Prisma.Decimal(dto.cashPaid),
            digitalPaid: new Prisma.Decimal(dto.digitalPaid),
            totalAmount: totalAmountDecimal,
            changeAmount: new Prisma.Decimal(dto.changeAmount),
            items: {
              create: detailsToCreate,
            },
          },
          include: {
            items: {
              include: {
                product: {
                  select: { id: true, name: true, barcode: true, unitType: true },
                },
              },
            },
            cashShift: {
              include: { cashRegister: true },
            },
            user: {
              select: { id: true, name: true, username: true },
            },
          },
        });

        return {
          message: 'Venta registrada exitosamente',
          sale: {
            ...sale,
            totalAmount: Number(sale.totalAmount),
            cashPaid: Number(sale.cashPaid),
            digitalPaid: Number(sale.digitalPaid),
            changeAmount: Number(sale.changeAmount),
            items: sale.items.map((i) => ({
              ...i,
              quantity: Number(i.quantity),
              unitPrice: Number(i.unitPrice),
              subtotal: Number(i.subtotal),
            })),
          },
        };
      },
      {
        timeout: 10000, // 10 segundos de timeout para operaciones concurrentes
      },
    );
  }

  /**
   * Anulación de venta protegida con PIN de Administrador
   */
  async voidSale(saleId: string, dto: VoidSaleDto) {
    // 1. Validar PIN del administrador
    const admin = await this.prisma.user.findFirst({
      where: {
        role: Role.ADMIN,
        isActive: true,
        pin: dto.adminPin,
      },
    });

    if (!admin) {
      throw new UnauthorizedException('PIN de administrador inválido para autorizar la anulación');
    }

    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        items: { include: { product: true } },
      },
    });

    if (!sale) {
      throw new NotFoundException('Venta no encontrada');
    }

    if (sale.isVoided) {
      throw new BadRequestException('Esta venta ya se encuentra anulada previamente');
    }

    // 2. Reingresar stock a Kardex y anular venta atómicamente
    return this.prisma.$transaction(async (tx) => {
      for (const item of sale.items) {
        const prod = await tx.product.findUnique({ where: { id: item.productId } });
        if (!prod) continue;

        const currentStockNum = Number(prod.currentStock);
        const qtyToReturn = Number(item.quantity);
        const newStock = currentStockNum + qtyToReturn;

        // Devolver stock
        await tx.product.update({
          where: { id: prod.id },
          data: {
            currentStock: new Prisma.Decimal(newStock),
          },
        });

        // Registrar devolución en Kardex
        await tx.kardexMovement.create({
          data: {
            productId: prod.id,
            movementType: MovementType.RETURN_SALE,
            quantity: new Prisma.Decimal(qtyToReturn),
            previousStock: prod.currentStock,
            newStock: new Prisma.Decimal(newStock),
            unitCost: prod.costPrice,
            reason: `Anulación de venta #${sale.saleNumber} - Motivo: ${dto.reason}`,
            userId: admin.id,
          },
        });
      }

      // Marcar venta como anulada
      const voided = await tx.sale.update({
        where: { id: sale.id },
        data: {
          isVoided: true,
          voidedAt: new Date(),
          voidedReason: dto.reason,
          voidedByAdminId: admin.id,
        },
      });

      return {
        message: 'Venta anulada correctamente. Stock devuelto a inventario.',
        saleId: voided.id,
        saleNumber: voided.saleNumber,
        authorizedBy: admin.name,
      };
    });
  }

  /**
   * Historial de ventas con control de visibilidad por rol
   */
  async getSales(userRole: Role, filter?: { shiftId?: string; isVoided?: boolean }) {
    const where: Prisma.SaleWhereInput = {};

    if (filter?.shiftId) where.cashShiftId = filter.shiftId;
    if (filter?.isVoided !== undefined) where.isVoided = filter.isVoided;

    const sales = await this.prisma.sale.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, barcode: true },
            },
          },
        },
        user: { select: { id: true, name: true, username: true } },
        cashShift: { include: { cashRegister: true } },
      },
    });

    return sales.map((s) => {
      const base = {
        id: s.id,
        saleNumber: s.saleNumber,
        createdAt: s.createdAt,
        customerName: s.customerName,
        customerDocument: s.customerDocument,
        paymentMethod: s.paymentMethod,
        cashPaid: Number(s.cashPaid),
        digitalPaid: Number(s.digitalPaid),
        totalAmount: Number(s.totalAmount),
        changeAmount: Number(s.changeAmount),
        isVoided: s.isVoided,
        voidedReason: s.voidedReason,
        user: s.user,
        cashRegister: s.cashShift.cashRegister.name,
        items: s.items.map((i) => ({
          id: i.id,
          productName: i.product.name,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
          subtotal: Number(i.subtotal),
        })),
      };

      if (userRole === Role.ADMIN) {
        // Calcular utilidad neta de la venta
        const totalCost = s.items.reduce(
          (acc, i) => acc + Number(i.quantity) * Number(i.costPriceSnapshot),
          0,
        );
        const profit = Number(s.totalAmount) - totalCost;

        return {
          ...base,
          totalCost: Number(totalCost.toFixed(2)),
          profit: Number(profit.toFixed(2)),
        };
      }

      return base;
    });
  }
}
