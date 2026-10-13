import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  Prisma,
  ShiftStatus,
  MovementType,
  Role,
  Product,
  CashMovementType,
  ReceiptType,
  EmissionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { BillingService } from '../billing/billing.service.js';
import { CreateSaleDto } from './dto/create-sale.dto.js';
import { VoidSaleDto } from './dto/void-sale.dto.js';
import { SyncOfflineSalesBatchDto } from './dto/sync-offline-sales.dto.js';

@Injectable()
export class SalesService {
  constructor(
    private prisma: PrismaService,
    private billingService: BillingService,
  ) {}

  /**
   * Helper para asignar series independientes por caja física y tipo de comprobante:
   * Caja 1 (POS-01): NV01, B001, F001
   * Caja 2 (POS-02): NV02, B002, F002
   */
  private getSeriesForRegister(
    identifier: string,
    name: string,
    receiptType: ReceiptType,
  ): string {
    let boxNum = '01';
    const match = identifier.match(/\d+/) || name.match(/\d+/);
    if (match) {
      boxNum = match[0].padStart(2, '0');
    }

    if (receiptType === ReceiptType.NOTA_VENTA) {
      return `NV${boxNum}`;
    } else if (receiptType === ReceiptType.BOLETA) {
      return `B${boxNum.padStart(3, '0')}`;
    } else if (receiptType === ReceiptType.FACTURA) {
      return `F${boxNum.padStart(3, '0')}`;
    } else if (receiptType === ReceiptType.NOTA_CREDITO_BOLETA) {
      return `BC${boxNum}`;
    } else if (receiptType === ReceiptType.NOTA_CREDITO_FACTURA) {
      return `FC${boxNum}`;
    }
    return `NV${boxNum}`;
  }

  /**
   * Registro atómico de venta en POS con CONTROL DE CONCURRENCIA ACID, Kardex
   * y Arquitectura de Comprobantes de Triple Vía (Nota de Venta, Boleta y Factura)
   */
  async createSale(userId: string, dto: CreateSaleDto) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('La venta debe incluir al menos un producto');
    }

    const receiptType = dto.receiptType || ReceiptType.NOTA_VENTA;

    // Validación preliminar estricta para Factura Electrónica
    if (receiptType === ReceiptType.FACTURA) {
      const ruc = (dto.customerDocument || '').trim();
      const validRucPrefixes = ['10', '20', '15', '17'];
      const hasValidPrefix = validRucPrefixes.some((prefix) => ruc.startsWith(prefix));

      if (!/^\d{11}$/.test(ruc) || !hasValidPrefix) {
        throw new BadRequestException(
          'Para emitir Factura Electrónica se exige un RUC válido de 11 dígitos que inicie con 10, 20, 15 o 17.',
        );
      }

      if (!dto.customerName || dto.customerName.trim().length < 2 || dto.customerName === 'Cliente Varios') {
        throw new BadRequestException(
          'La Razón Social de la empresa es estrictamente obligatoria para emitir Factura.',
        );
      }

      if (!dto.customerAddress || dto.customerAddress.trim().length < 3) {
        throw new BadRequestException(
          'La Dirección Fiscal de la empresa es estrictamente obligatoria para emitir Factura.',
        );
      }
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

        // 1. Validar existencias de stock y preparar detalles de la venta
        const validatedItems: {
          product: Product;
          quantity: number;
          unitPrice: number;
          subtotalItem: number;
        }[] = [];

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
              `Stock insuficiente para "${product.name}". Solicitado: ${item.quantity}, Disponible en tienda: ${currentStockNum}`,
            );
          }

          const subtotalItem = Number((item.quantity * item.unitPrice).toFixed(2));
          totalCalculated += subtotalItem;

          detailsToCreate.push({
            productId: product.id,
            quantity: new Prisma.Decimal(item.quantity),
            unitPrice: new Prisma.Decimal(item.unitPrice),
            subtotal: new Prisma.Decimal(subtotalItem),
            costPriceSnapshot: product.costPrice,
          });

          validatedItems.push({
            product,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotalItem,
          });
        }

        totalCalculated = Number(totalCalculated.toFixed(2));
        const totalAmountDecimal = new Prisma.Decimal(totalCalculated);

        // Validación fiscal para Boletas de Venta: Exigencia de DNI si es >= S/ 700.00
        if (receiptType === ReceiptType.BOLETA && totalCalculated >= 700) {
          const dni = (dto.customerDocument || '').trim();
          if (!/^\d{8}$/.test(dni)) {
            throw new BadRequestException(
              `Para Boletas de Venta con monto igual o superior a S/ 700.00 (Total: S/ ${totalCalculated.toFixed(2)}), SUNAT exige DNI obligatorio de 8 dígitos.`,
            );
          }
          if (!dto.customerName || dto.customerName.trim().length < 3 || dto.customerName === 'Cliente Varios') {
            throw new BadRequestException(
              'Para Boletas de Venta con monto igual o superior a S/ 700.00, se requieren los nombres y apellidos completos del cliente.',
            );
          }
        }

        // 2. Control Concurrente de Correlativos Estrictamente Consecutivos (Bloqueo a nivel de fila)
        const series = this.getSeriesForRegister(
          shift.cashRegister.identifier,
          shift.cashRegister.name,
          receiptType,
        );

        const sequence = await tx.receiptSequence.upsert({
          where: { series },
          create: {
            cashRegisterId: shift.cashRegisterId,
            receiptType,
            series,
            currentNumber: 1,
          },
          update: {
            currentNumber: { increment: 1 },
          },
        });

        const correlativeNumber = sequence.currentNumber;
        const fullReceiptNumber = `${series}-${String(correlativeNumber).padStart(8, '0')}`;

        // 3. Bifurcación del Flujo de Venta y Motor de Facturación
        let isFiscal = false;
        let taxableBase = 0;
        let igvAmount = 0;
        let hash: string | null = null;
        let qrString: string | null = null;
        let emissionStatus: EmissionStatus | null = null;

        if (receiptType === ReceiptType.NOTA_VENTA) {
          // VÍA 1: NOTA DE VENTA / TICKET INTERNO (Prioridad Operativa - Despacho Ultrarrápido)
          // Se omite por completo cualquier llamada a servicios externos o motores de facturación.
          isFiscal = false;
          taxableBase = Number((totalCalculated / 1.18).toFixed(2));
          igvAmount = 0;
          hash = null;
          qrString = null;
          emissionStatus = null;
        } else {
          // VÍAS 2 & 3: BOLETA Y FACTURA ELECTRÓNICA (Fiscal)
          isFiscal = true;
          taxableBase = Number((totalCalculated / 1.18).toFixed(2));
          igvAmount = Number((totalCalculated - taxableBase).toFixed(2));

          const storeConfig = await tx.storeConfig.findFirst();
          const billingRes = await this.billingService.issueReceipt({
            receiptType: receiptType as 'BOLETA' | 'FACTURA',
            series,
            correlativeNumber,
            totalAmount: totalCalculated,
            taxableBase,
            igvAmount,
            customerName:
              dto.customerName ||
              (receiptType === ReceiptType.BOLETA ? 'CLIENTES VARIOS' : ''),
            customerDocument: dto.customerDocument,
            customerAddress: dto.customerAddress,
            customerEmail: dto.customerEmail?.trim() || null,
            paymentMethod: dto.paymentMethod,
            companyRuc: storeConfig?.ruc || '10458923011',
            items: validatedItems.map((vi) => ({
              name: vi.product.name,
              quantity: vi.quantity,
              unitPrice: vi.unitPrice,
              subtotal: vi.subtotalItem,
            })),
          });

          hash = billingRes.hash;
          qrString = billingRes.qrString;
          emissionStatus = billingRes.emissionStatus as EmissionStatus;
        }

        // 4. Crear la Venta y sus Detalles de forma atómica
        const sale = await tx.sale.create({
          data: {
            cashShiftId: shift.id,
            userId,
            receiptType,
            series,
            correlativeNumber,
            fullReceiptNumber,
            isFiscal,
            taxableBase: new Prisma.Decimal(taxableBase),
            igvAmount: new Prisma.Decimal(igvAmount),
            customerAddress: dto.customerAddress || null,
            customerEmail: dto.customerEmail?.trim() || null,
            hash,
            qrString,
            emissionStatus,
            customerName:
              dto.customerName ||
              (receiptType === ReceiptType.BOLETA
                ? 'Clientes Varios'
                : receiptType === ReceiptType.FACTURA
                  ? 'EMPRESA'
                  : 'Cliente Varios'),
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

        // 5. Descontar stock atómicamente y asentar en Kardex con referencia exacta al comprobante
        for (const item of validatedItems) {
          const currentStockNum = Number(item.product.currentStock);
          const newStock = Number((currentStockNum - item.quantity).toFixed(3));

          // Descontar existencias físicas
          await tx.product.update({
            where: { id: item.product.id },
            data: {
              currentStock: new Prisma.Decimal(newStock),
            },
          });

          // Registrar movimiento en Kardex de tipo SALIDA (SALE) con trazabilidad total
          await tx.kardexMovement.create({
            data: {
              productId: item.product.id,
              movementType: MovementType.SALE,
              quantity: new Prisma.Decimal(item.quantity),
              previousStock: item.product.currentStock,
              newStock: new Prisma.Decimal(newStock),
              unitCost: item.product.costPrice,
              referenceId: sale.id,
              reason: `Venta POS [${fullReceiptNumber}] - ${shift.cashRegister.name}`,
              userId,
            },
          });
        }

        return {
          message: isFiscal
            ? `Comprobante electrónico (${receiptType}) emitido con éxito: ${fullReceiptNumber}`
            : `Nota de venta interna registrada con éxito: ${fullReceiptNumber}`,
          sale: {
            ...sale,
            totalAmount: Number(sale.totalAmount),
            taxableBase: Number(sale.taxableBase),
            igvAmount: Number(sale.igvAmount),
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
   * Anulación de venta protegida con PIN de Administrador.
   * Si es Boleta o Factura electrónica, emite automáticamente la Nota de Crédito Oficial SUNAT
   * y revierte el stock atómicamente a Kardex.
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
        cashShift: { include: { cashRegister: true } },
      },
    });

    if (!sale) {
      throw new NotFoundException('Venta no encontrada');
    }

    if (sale.isVoided) {
      throw new BadRequestException('Esta venta ya se encuentra anulada previamente');
    }

    const isFiscal =
      sale.receiptType === ReceiptType.BOLETA || sale.receiptType === ReceiptType.FACTURA;

    // 2. Reingresar stock a Kardex, emitir Nota de Crédito si aplica y anular venta atómicamente
    return this.prisma.$transaction(
      async (tx) => {
        let creditNoteResult: any = null;

        // Si es Boleta o Factura, generar Nota de Crédito Electrónica según normativa SUNAT
        if (isFiscal) {
          const ncReceiptType =
            sale.receiptType === ReceiptType.BOLETA
              ? ReceiptType.NOTA_CREDITO_BOLETA
              : ReceiptType.NOTA_CREDITO_FACTURA;

          const registerIdentifier = sale.cashShift.cashRegister.identifier;
          const registerName = sale.cashShift.cashRegister.name;
          const ncSeries = this.getSeriesForRegister(
            registerIdentifier,
            registerName,
            ncReceiptType,
          );

          const sequence = await tx.receiptSequence.upsert({
            where: { series: ncSeries },
            create: {
              cashRegisterId: sale.cashShift.cashRegisterId,
              receiptType: ncReceiptType,
              series: ncSeries,
              currentNumber: 1,
            },
            update: {
              currentNumber: { increment: 1 },
            },
          });

          const ncCorrelative = sequence.currentNumber;
          const ncFullNumber = `${ncSeries}-${String(ncCorrelative).padStart(8, '0')}`;
          const reasonCode = dto.reasonCode || '01';
          const reasonDescription =
            dto.reasonDescription ||
            (reasonCode === '01'
              ? 'ANULACIÓN DE LA OPERACIÓN'
              : reasonCode === '02'
                ? 'ANULACIÓN POR ERROR EN EL RUC'
                : reasonCode === '06'
                  ? 'DEVOLUCIÓN TOTAL'
                  : dto.reason);

          const storeConfig = await tx.storeConfig.findFirst();

          const billingRes = await this.billingService.issueCreditNote({
            saleId: sale.id,
            receiptType: sale.receiptType as 'BOLETA' | 'FACTURA',
            creditNoteSeries: ncSeries,
            creditNoteCorrelative: ncCorrelative,
            modifiedReceiptType: sale.receiptType as 'BOLETA' | 'FACTURA',
            modifiedDocTypeCode: sale.receiptType === ReceiptType.FACTURA ? '01' : '03',
            modifiedSeries: sale.series,
            modifiedCorrelative: sale.correlativeNumber,
            modifiedFullNumber:
              sale.fullReceiptNumber ||
              `${sale.series}-${String(sale.correlativeNumber).padStart(8, '0')}`,
            reasonCode,
            reasonDescription,
            customReason: dto.reason,
            totalAmount: Number(sale.totalAmount),
            taxableBase: Number(sale.taxableBase),
            igvAmount: Number(sale.igvAmount),
            customerName:
              sale.customerName ||
              (sale.receiptType === ReceiptType.FACTURA ? 'EMPRESA' : 'CLIENTES VARIOS'),
            customerDocument: sale.customerDocument,
            customerAddress: sale.customerAddress,
            companyRuc: storeConfig?.ruc || '10458923011',
            items: sale.items.map((i) => ({
              name: i.product.name,
              quantity: Number(i.quantity),
              unitPrice: Number(i.unitPrice),
              subtotal: Number(i.subtotal),
            })),
            createdAt: new Date(),
          });

          const createdCreditNote = await tx.creditNote.create({
            data: {
              series: ncSeries,
              correlativeNumber: ncCorrelative,
              fullNumber: ncFullNumber,
              saleId: sale.id,
              reasonCode,
              reasonDescription,
              customReason: dto.reason,
              taxableBase: sale.taxableBase,
              igvAmount: sale.igvAmount,
              totalAmount: sale.totalAmount,
              hash: billingRes.hash,
              qrString: billingRes.qrString,
              emissionStatus: billingRes.emissionStatus as EmissionStatus,
              externalId: billingRes.externalId,
              adminId: admin.id,
              cashShiftId: sale.cashShiftId,
            },
          });

          creditNoteResult = {
            id: createdCreditNote.id,
            series: createdCreditNote.series,
            correlativeNumber: createdCreditNote.correlativeNumber,
            fullNumber: createdCreditNote.fullNumber,
            reasonCode: createdCreditNote.reasonCode,
            reasonDescription: createdCreditNote.reasonDescription,
            customReason: createdCreditNote.customReason,
            taxableBase: Number(createdCreditNote.taxableBase),
            igvAmount: Number(createdCreditNote.igvAmount),
            totalAmount: Number(createdCreditNote.totalAmount),
            hash: createdCreditNote.hash,
            qrString: createdCreditNote.qrString,
            emissionStatus: createdCreditNote.emissionStatus,
            createdAt: createdCreditNote.createdAt,
          };
        }

        // Reingresar stock a Kardex
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
          const reasonText = creditNoteResult
            ? `Nota de Crédito ${creditNoteResult.fullNumber} [Anula ${sale.fullReceiptNumber || sale.saleNumber}] - Motivo: ${dto.reason}`
            : `Anulación de venta #${sale.saleNumber} - Motivo: ${dto.reason}`;

          await tx.kardexMovement.create({
            data: {
              productId: prod.id,
              movementType: MovementType.RETURN_SALE,
              quantity: new Prisma.Decimal(qtyToReturn),
              previousStock: prod.currentStock,
              newStock: new Prisma.Decimal(newStock),
              unitCost: prod.costPrice,
              referenceId: sale.id,
              reason: reasonText,
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
          message: creditNoteResult
            ? `Nota de Crédito ${creditNoteResult.fullNumber} emitida con éxito. Venta anulada y stock devuelto a inventario.`
            : 'Venta anulada correctamente. Stock devuelto a inventario.',
          saleId: voided.id,
          saleNumber: voided.saleNumber,
          authorizedBy: admin.name,
          creditNote: creditNoteResult,
        };
      },
      { timeout: 15000 },
    );
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
        creditNote: true,
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
        receiptType: s.receiptType,
        series: s.series,
        correlativeNumber: s.correlativeNumber,
        fullReceiptNumber:
          s.fullReceiptNumber || `${s.series}-${String(s.correlativeNumber).padStart(8, '0')}`,
        isFiscal: s.isFiscal,
        taxableBase: Number(s.taxableBase),
        igvAmount: Number(s.igvAmount),
        customerAddress: s.customerAddress,
        customerEmail: s.customerEmail,
        hash: s.hash,
        qrString: s.qrString,
        emissionStatus: s.emissionStatus,
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
        creditNote: s.creditNote
          ? {
              id: s.creditNote.id,
              series: s.creditNote.series,
              correlativeNumber: s.creditNote.correlativeNumber,
              fullNumber: s.creditNote.fullNumber,
              reasonCode: s.creditNote.reasonCode,
              reasonDescription: s.creditNote.reasonDescription,
              customReason: s.creditNote.customReason,
              taxableBase: Number(s.creditNote.taxableBase),
              igvAmount: Number(s.creditNote.igvAmount),
              totalAmount: Number(s.creditNote.totalAmount),
              hash: s.creditNote.hash,
              qrString: s.creditNote.qrString,
              emissionStatus: s.creditNote.emissionStatus,
              createdAt: s.creditNote.createdAt,
            }
          : null,
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

  /**
   * Consulta de RUC / DNI para autocompletado en el POS
   * Si es RUC (11 dígitos): retorna razón social, dirección fiscal, estado y condición SUNAT
   * Si es DNI (8 dígitos): retorna nombres y apellidos
   */
  async lookupDocument(document: string) {
    const clean = (document || '').trim();
    if (!/^\d{8}$/.test(clean) && !/^\d{11}$/.test(clean)) {
      throw new BadRequestException('El documento debe ser un DNI de 8 dígitos o un RUC de 11 dígitos');
    }

    if (clean.length === 11) {
      // 1. Validar prefijos válidos de RUC peruano
      const validPrefixes = ['10', '20', '15', '17'];
      const hasValidPrefix = validPrefixes.some((p) => clean.startsWith(p));
      if (!hasValidPrefix) {
        throw new BadRequestException('El RUC debe comenzar con 10, 20, 15 o 17');
      }

      // 2. Intentar consulta a servicio público SUNAT
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);

        const res = await fetch(`https://api.apis.net.pe/v1/ruc?numero=${clean}`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        clearTimeout(timeout);

        if (res.ok) {
          const data: any = await res.json();
          if (data && (data.nombre || data.razonSocial)) {
            const fullAddress = [
              data.direccion,
              data.distrito,
              data.provincia,
              data.departamento,
            ]
              .filter(Boolean)
              .join(' - ');

            return {
              documentType: 'RUC',
              documentNumber: clean,
              name: (data.nombre || data.razonSocial || '').trim(),
              address: fullAddress || data.direccion || 'LIMA, PERÚ',
              status: data.estado || 'ACTIVO',
              condition: data.condicion || 'HABIDO',
              source: 'SUNAT_LIVE',
            };
          }
        }
      } catch (err) {
        // Si hay timeout o no hay conexión hacia la API pública, utilizar padrón inteligente
      }

      // 3. Padrón Inteligente con empresas peruanas de referencia y fallback estructurado
      const knownRucs: Record<string, { name: string; address: string }> = {
        '20100055237': {
          name: 'ALICORP S.A.A.',
          address: 'Av. Argentina Nro. 4793, Carmen de la Legua Reynoso, Callao',
        },
        '20100010721': {
          name: 'LECHE GLORIA SOCIEDAD ANONIMA - GLORIA S.A.',
          address: 'Av. República de Panamá Nro. 2461, Santa Catalina, La Victoria, Lima',
        },
        '20100107482': {
          name: 'BANCO DE CREDITO DEL PERU',
          address: 'Calle Centenario Nro. 156, Urb. Las Laderas de Melgarejo, La Molina, Lima',
        },
        '20100070970': {
          name: 'SUPERMERCADOS PERUANOS SOCIEDAD ANONIMA',
          address: 'Calle Morelli Nro. 181 Int. P-2, San Borja, Lima',
        },
        '20100053455': {
          name: 'UNION DE CERVECERIAS PERUANAS BACKUS Y JOHNSTON S.A.A.',
          address: 'Av. Nicolás Ayllón Nro. 3986, Ate, Lima',
        },
        '20601234567': {
          name: 'DISTRIBUIDORA COMERCIAL LIMA S.A.C.',
          address: 'Av. Nicolás de Piérola 1045, Cercado de Lima, Lima',
        },
        '10458923011': {
          name: 'RODRIGO ALVAREZ JORGE - COMERCIAL RODRIGO',
          address: 'Av. Principal 1234, Lima',
        },
      };

      if (knownRucs[clean]) {
        return {
          documentType: 'RUC',
          documentNumber: clean,
          name: knownRucs[clean].name,
          address: knownRucs[clean].address,
          status: 'ACTIVO',
          condition: 'HABIDO',
          source: 'PADRON_MOCK',
        };
      }

      const isPersonaNatural = clean.startsWith('10');
      const generatedName = isPersonaNatural
        ? `CLIENTE FISCAL EMPRENDEDOR RUC ${clean}`
        : `EMPRESA PERUANA ASOCIADOS RUC ${clean} S.A.C.`;

      return {
        documentType: 'RUC',
        documentNumber: clean,
        name: generatedName,
        address: 'Av. Los Comerciantes 450, Urb. Industrial, Lima',
        status: 'ACTIVO',
        condition: 'HABIDO',
        source: 'PADRON_MOCK',
      };
    } else {
      // DNI (8 dígitos)
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);

        const res = await fetch(`https://api.apis.net.pe/v1/dni?numero=${clean}`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        clearTimeout(timeout);

        if (res.ok) {
          const data: any = await res.json();
          if (data && data.nombre) {
            return {
              documentType: 'DNI',
              documentNumber: clean,
              name: data.nombre.trim(),
              source: 'RENIEC_LIVE',
            };
          }
        }
      } catch (err) {
        // Fallback
      }

      return {
        documentType: 'DNI',
        documentNumber: clean,
        name: `Cliente DNI ${clean}`,
        source: 'RENIEC_MOCK',
      };
    }
  }

  /**
   * Reporte detallado de ganancias y rentabilidad (Solo Administrador)
   */
  async getProfitReport(filter?: { startDate?: string; endDate?: string; shiftId?: string }) {
    const saleWhere: Prisma.SaleWhereInput = {
      isVoided: false,
    };

    const expenseWhere: Prisma.CashMovementWhereInput = {
      type: CashMovementType.EXPENSE,
    };

    if (filter?.shiftId) {
      saleWhere.cashShiftId = filter.shiftId;
      expenseWhere.cashShiftId = filter.shiftId;
    }

    if (filter?.startDate || filter?.endDate) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (filter.startDate) {
        const sStr = filter.startDate.trim();
        const start = sStr.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(sStr)
          ? new Date(sStr)
          : sStr.includes('T')
            ? new Date(`${sStr}-05:00`)
            : new Date(`${sStr}T00:00:00.000-05:00`);
        if (!isNaN(start.getTime())) dateFilter.gte = start;
      }
      if (filter.endDate) {
        const eStr = filter.endDate.trim();
        const end = eStr.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(eStr)
          ? new Date(eStr)
          : eStr.includes('T')
            ? new Date(`${eStr}-05:00`)
            : new Date(`${eStr}T23:59:59.999-05:00`);
        if (!isNaN(end.getTime())) dateFilter.lte = end;
      }
      if (dateFilter.gte || dateFilter.lte) {
        saleWhere.createdAt = dateFilter;
        expenseWhere.createdAt = dateFilter;
      }
    }

    const [sales, expenses] = await Promise.all([
      this.prisma.sale.findMany({
        where: saleWhere,
        orderBy: { createdAt: 'desc' },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  barcode: true,
                  unitType: true,
                  category: { select: { id: true, name: true } },
                },
              },
            },
          },
          user: { select: { id: true, name: true, username: true } },
          cashShift: { include: { cashRegister: true } },
        },
      }),
      this.prisma.cashMovement.findMany({
        where: expenseWhere,
        orderBy: { createdAt: 'desc' },
        include: {
          cashShift: {
            include: {
              cashRegister: true,
              user: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    // Resumen financiero
    let totalSales = 0;
    let totalCost = 0;
    let totalUnitsSold = 0;
    let cashPaidTotal = 0;
    let digitalPaidTotal = 0;

    const paymentMethods: Record<string, number> = {
      CASH: 0,
      CARD: 0,
      TRANSFER: 0,
      MIXED: 0,
    };

    // Agrupación de métricas por producto vendido
    const productStatsMap = new Map<
      string,
      {
        productId: string;
        productName: string;
        barcode: string | null;
        categoryName: string;
        unitType: string;
        quantitySold: number;
        totalRevenue: number;
        totalCost: number;
        profit: number;
        marginPct: number;
      }
    >();

    const salesDetail = sales.map((s) => {
      const saleAmount = Number(s.totalAmount);
      totalSales += saleAmount;
      cashPaidTotal += Number(s.cashPaid);
      digitalPaidTotal += Number(s.digitalPaid);

      if (paymentMethods[s.paymentMethod] !== undefined) {
        paymentMethods[s.paymentMethod] += saleAmount;
      }

      let saleCost = 0;
      let saleUnits = 0;

      const itemsDetail = s.items.map((i) => {
        const qty = Number(i.quantity);
        const unitP = Number(i.unitPrice);
        const sub = Number(i.subtotal);
        const unitCost = Number(i.costPriceSnapshot);
        const itemCost = Number((qty * unitCost).toFixed(2));
        const itemProfit = Number((sub - itemCost).toFixed(2));

        saleCost += itemCost;
        saleUnits += qty;
        totalUnitsSold += qty;

        const prodKey = i.productId;
        const existing = productStatsMap.get(prodKey);
        if (existing) {
          existing.quantitySold += qty;
          existing.totalRevenue += sub;
          existing.totalCost += itemCost;
          existing.profit += itemProfit;
        } else {
          productStatsMap.set(prodKey, {
            productId: i.productId,
            productName: i.product.name,
            barcode: i.product.barcode,
            categoryName: i.product.category?.name || 'General',
            unitType: i.product.unitType,
            quantitySold: qty,
            totalRevenue: sub,
            totalCost: itemCost,
            profit: itemProfit,
            marginPct: 0,
          });
        }

        return {
          id: i.id,
          productId: i.productId,
          productName: i.product.name,
          barcode: i.product.barcode,
          quantity: qty,
          unitPrice: unitP,
          costPrice: unitCost,
          subtotal: sub,
          itemCost,
          profit: itemProfit,
        };
      });

      totalCost += saleCost;
      const saleProfit = Number((saleAmount - saleCost).toFixed(2));
      const saleMarginPct =
        saleCost > 0 ? Number(((saleProfit / saleCost) * 100).toFixed(1)) : 0;

      return {
        id: s.id,
        saleNumber: s.saleNumber,
        receiptType: s.receiptType,
        series: s.series,
        fullReceiptNumber:
          s.fullReceiptNumber || `${s.series}-${String(s.correlativeNumber).padStart(8, '0')}`,
        isFiscal: s.isFiscal,
        taxableBase: Number(s.taxableBase),
        igvAmount: Number(s.igvAmount),
        createdAt: s.createdAt,
        customerName: s.customerName,
        paymentMethod: s.paymentMethod,
        cashPaid: Number(s.cashPaid),
        digitalPaid: Number(s.digitalPaid),
        totalAmount: saleAmount,
        totalCost: Number(saleCost.toFixed(2)),
        profit: saleProfit,
        marginPct: saleMarginPct,
        unitsCount: saleUnits,
        cashier: s.user.name,
        cashRegister: s.cashShift?.cashRegister?.name || 'Caja',
        items: itemsDetail,
      };
    });

    // Calcular márgenes individuales y ordenar por mayor utilidad
    const productStats = Array.from(productStatsMap.values()).map((p) => {
      const margin =
        p.totalCost > 0
          ? Number(((p.profit / p.totalCost) * 100).toFixed(1))
          : 0;
      return {
        ...p,
        totalRevenue: Number(p.totalRevenue.toFixed(2)),
        totalCost: Number(p.totalCost.toFixed(2)),
        profit: Number(p.profit.toFixed(2)),
        marginPct: margin,
      };
    });

    productStats.sort((a, b) => b.profit - a.profit);

    // Gastos de caja menor registrados en el período
    const totalExpenses = expenses.reduce((acc, exp) => acc + Number(exp.amount), 0);
    const grossProfit = Number((totalSales - totalCost).toFixed(2));
    const netProfit = Number((grossProfit - totalExpenses).toFixed(2));
    const grossMarginPct =
      totalCost > 0 ? Number(((grossProfit / totalCost) * 100).toFixed(1)) : 0;
    const netMarginPct =
      totalSales > 0 ? Number(((netProfit / totalSales) * 100).toFixed(1)) : 0;

    return {
      summary: {
        totalSales: Number(totalSales.toFixed(2)),
        totalCost: Number(totalCost.toFixed(2)),
        grossProfit,
        totalExpenses: Number(totalExpenses.toFixed(2)),
        netProfit,
        grossMarginPct,
        netMarginPct,
        salesCount: sales.length,
        totalUnitsSold: Number(totalUnitsSold.toFixed(2)),
        cashPaidTotal: Number(cashPaidTotal.toFixed(2)),
        digitalPaidTotal: Number(digitalPaidTotal.toFixed(2)),
        paymentMethods,
      },
      products: productStats,
      sales: salesDetail,
      expenses: expenses.map((e) => ({
        id: e.id,
        amount: Number(e.amount),
        reason: e.reason,
        createdAt: e.createdAt,
        cashRegister: e.cashShift?.cashRegister?.name || 'Caja',
        cashier: e.cashShift?.user?.name || '--',
      })),
    };
  }

  /**
   * Sincronización en lote de ventas procesadas offline (modo sin conexión)
   * Garantiza idempotencia, trazabilidad de Kardex con fecha real y tolerancia a turnos cerrados
   */
  async syncOfflineSales(userId: string, batchDto: SyncOfflineSalesBatchDto) {
    if (!batchDto.sales || batchDto.sales.length === 0) {
      return {
        message: 'No hay ventas offline para sincronizar',
        total: 0,
        syncedCount: 0,
        failedCount: 0,
        results: [],
      };
    }

    const results: {
      offlineId: string;
      success: boolean;
      sale?: any;
      error?: string;
    }[] = [];

    for (const offlineSale of batchDto.sales) {
      try {
        // 1. Idempotencia: Verificar si ya fue procesada anteriormente para no duplicar ventas
        const existingKardex = await this.prisma.kardexMovement.findFirst({
          where: {
            reason: { contains: `[OFFLINE:${offlineSale.offlineId}]` },
          },
        });

        if (existingKardex && existingKardex.referenceId) {
          const existingSale = await this.prisma.sale.findUnique({
            where: { id: existingKardex.referenceId },
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

          if (existingSale) {
            results.push({
              offlineId: offlineSale.offlineId,
              success: true,
              sale: {
                ...existingSale,
                totalAmount: Number(existingSale.totalAmount),
                cashPaid: Number(existingSale.cashPaid),
                digitalPaid: Number(existingSale.digitalPaid),
                changeAmount: Number(existingSale.changeAmount),
                items: existingSale.items.map((i) => ({
                  ...i,
                  quantity: Number(i.quantity),
                  unitPrice: Number(i.unitPrice),
                  subtotal: Number(i.subtotal),
                })),
              },
            });
            continue;
          }
        }

        // 2. Asociar al turno de caja (incluso si ya fue cerrado posteriormente)
        let targetShift = await this.prisma.cashShift.findUnique({
          where: { id: offlineSale.cashShiftId },
          include: { cashRegister: true },
        });

        if (!targetShift) {
          targetShift = await this.prisma.cashShift.findFirst({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            include: { cashRegister: true },
          });
        }

        if (!targetShift) {
          throw new BadRequestException('No se encontró un turno de caja para asociar la venta offline');
        }

        // 3. Crear venta y movimientos de Kardex
        const saleResult = await this.prisma.$transaction(
          async (tx) => {
            let totalCalculated = 0;
            const detailsToCreate: {
              productId: string;
              quantity: Prisma.Decimal;
              unitPrice: Prisma.Decimal;
              subtotal: Prisma.Decimal;
              costPriceSnapshot: Prisma.Decimal;
            }[] = [];

            const validatedItems: {
              product: Product;
              quantity: number;
              unitPrice: number;
              subtotalItem: number;
            }[] = [];

            for (const item of offlineSale.items) {
              const product = await tx.product.findUnique({
                where: { id: item.productId },
              });

              if (!product) {
                throw new BadRequestException(`Producto ID ${item.productId} no encontrado`);
              }

              const subtotalItem = Number((item.quantity * item.unitPrice).toFixed(2));
              totalCalculated += subtotalItem;

              detailsToCreate.push({
                productId: product.id,
                quantity: new Prisma.Decimal(item.quantity),
                unitPrice: new Prisma.Decimal(item.unitPrice),
                subtotal: new Prisma.Decimal(subtotalItem),
                costPriceSnapshot: product.costPrice,
              });

              validatedItems.push({
                product,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                subtotalItem,
              });
            }

            const totalAmountDecimal = new Prisma.Decimal(Number(totalCalculated.toFixed(2)));
            const saleDate = offlineSale.createdAt ? new Date(offlineSale.createdAt) : new Date();

            const receiptType = offlineSale.receiptType || ReceiptType.NOTA_VENTA;
            const isFiscal = receiptType !== ReceiptType.NOTA_VENTA;
            const taxableBase = Number((totalCalculated / 1.18).toFixed(2));
            const igvAmount = isFiscal ? Number((totalCalculated - taxableBase).toFixed(2)) : 0;

            const series = this.getSeriesForRegister(
              targetShift.cashRegister.identifier,
              targetShift.cashRegister.name,
              receiptType,
            );

            const sequence = await tx.receiptSequence.upsert({
              where: { series },
              create: {
                cashRegisterId: targetShift.cashRegisterId,
                receiptType,
                series,
                currentNumber: 1,
              },
              update: {
                currentNumber: { increment: 1 },
              },
            });

            const correlativeNumber = sequence.currentNumber;
            const fullReceiptNumber = `${series}-${String(correlativeNumber).padStart(8, '0')}`;

            let hash: string | null = null;
            let qrString: string | null = null;
            let emissionStatus: EmissionStatus | null = null;

            if (isFiscal) {
              const storeConfig = await tx.storeConfig.findFirst();
              const billingRes = await this.billingService.issueReceipt({
                receiptType: receiptType as 'BOLETA' | 'FACTURA',
                series,
                correlativeNumber,
                totalAmount: totalCalculated,
                taxableBase,
                igvAmount,
                customerName: offlineSale.customerName || 'CLIENTES VARIOS',
                customerDocument: offlineSale.customerDocument,
                customerAddress: offlineSale.customerAddress,
                customerEmail: offlineSale.customerEmail,
                paymentMethod: offlineSale.paymentMethod,
                companyRuc: storeConfig?.ruc || '10458923011',
                items: validatedItems.map((vi) => ({
                  name: vi.product.name,
                  quantity: vi.quantity,
                  unitPrice: vi.unitPrice,
                  subtotal: vi.subtotalItem,
                })),
                createdAt: saleDate,
              });
              hash = billingRes.hash;
              qrString = billingRes.qrString;
              emissionStatus = billingRes.emissionStatus as EmissionStatus;
            }

            const sale = await tx.sale.create({
              data: {
                cashShiftId: targetShift.id,
                userId,
                receiptType,
                series,
                correlativeNumber,
                fullReceiptNumber,
                isFiscal,
                taxableBase: new Prisma.Decimal(taxableBase),
                igvAmount: new Prisma.Decimal(igvAmount),
                customerAddress: offlineSale.customerAddress || null,
                customerEmail: offlineSale.customerEmail || null,
                hash,
                qrString,
                emissionStatus,
                customerName: offlineSale.customerName || 'Cliente Varios',
                customerDocument: offlineSale.customerDocument || null,
                paymentMethod: offlineSale.paymentMethod,
                cashPaid: new Prisma.Decimal(offlineSale.cashPaid),
                digitalPaid: new Prisma.Decimal(offlineSale.digitalPaid),
                totalAmount: totalAmountDecimal,
                changeAmount: new Prisma.Decimal(offlineSale.changeAmount),
                createdAt: saleDate,
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

            // 4. Actualizar stock y registrar en Kardex con fecha original
            for (const item of validatedItems) {
              const currentStockNum = Number(item.product.currentStock);
              const newStock = Number((currentStockNum - item.quantity).toFixed(3));

              await tx.product.update({
                where: { id: item.product.id },
                data: {
                  currentStock: new Prisma.Decimal(newStock),
                },
              });

              await tx.kardexMovement.create({
                data: {
                  productId: item.product.id,
                  movementType: MovementType.SALE,
                  quantity: new Prisma.Decimal(item.quantity),
                  previousStock: item.product.currentStock,
                  newStock: new Prisma.Decimal(newStock),
                  unitCost: item.product.costPrice,
                  referenceId: sale.id,
                  reason: `Venta POS Offline #${sale.saleNumber} [OFFLINE:${offlineSale.offlineId}] - ${targetShift.cashRegister.name}`,
                  userId,
                  createdAt: saleDate,
                },
              });
            }

            return sale;
          },
          { timeout: 15000 },
        );

        results.push({
          offlineId: offlineSale.offlineId,
          success: true,
          sale: {
            ...saleResult,
            totalAmount: Number(saleResult.totalAmount),
            taxableBase: Number(saleResult.taxableBase),
            igvAmount: Number(saleResult.igvAmount),
            cashPaid: Number(saleResult.cashPaid),
            digitalPaid: Number(saleResult.digitalPaid),
            changeAmount: Number(saleResult.changeAmount),
            items: saleResult.items.map((i) => ({
              ...i,
              quantity: Number(i.quantity),
              unitPrice: Number(i.unitPrice),
              subtotal: Number(i.subtotal),
            })),
          },
        });
      } catch (err: any) {
        results.push({
          offlineId: offlineSale.offlineId,
          success: false,
          error: err.message || 'Error al procesar venta offline',
        });
      }
    }

    return {
      message: `Procesadas ${results.length} ventas offline`,
      total: results.length,
      syncedCount: results.filter((r) => r.success).length,
      failedCount: results.filter((r) => !r.success).length,
      results,
    };
  }
}

