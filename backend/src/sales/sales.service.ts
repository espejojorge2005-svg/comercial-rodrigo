/**
 * Servicio de Ventas, Comprobantes de Pago y Notas de Crédito Electrónicas
 */
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  Logger,
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
import { ConvertSaleReceiptDto } from './dto/convert-receipt.dto.js';
import { SyncOfflineSalesBatchDto } from './dto/sync-offline-sales.dto.js';
import { calculateNetCashFromSale } from '../cash-shifts/cash-shifts.service.js';

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private prisma: PrismaService,
    private billingService: BillingService,
  ) {}

  /**
   * Helper para asignar series independientes por caja física y tipo de comprobante:
   * Caja 1 (POS-01): NV01, B001, F001, BC01, FC01
   * Caja 2 (POS-02): NV02, B002, F002, BC02, FC02
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
    const txResult = await this.prisma.$transaction(
      async (tx) => {
        let totalCalculated = 0;
        let totalTaxableBase = 0;
        let totalIgv = 0;
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
          // Cálculo fiscal línea por línea (Catálogo 07 SUNAT / Redondeo a 2 decimales por producto)
          const itemValorTotal = Number((subtotalItem / 1.18).toFixed(2));
          const itemIgv = Number((subtotalItem - itemValorTotal).toFixed(2));

          totalCalculated += subtotalItem;
          totalTaxableBase += itemValorTotal;
          totalIgv += itemIgv;

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
        totalTaxableBase = Number(totalTaxableBase.toFixed(2));
        totalIgv = Number(totalIgv.toFixed(2));
        const totalAmountDecimal = new Prisma.Decimal(totalCalculated);

        // 🛡️ VALIDACIÓN FINANCIERA (Cuadre de Efectivo, Digital y Vuelto con tolerancia por redondeo BCRP):
        // En Perú no circulan monedas de 1 ni 5 céntimos (la menor es S/ 0.10). Se asume tolerancia de hasta S/ 0.10.
        const cashPaidNum = Number(dto.cashPaid ?? 0);
        const digitalPaidNum = Number(dto.digitalPaid ?? 0);
        const changeAmountNum = Number(dto.changeAmount ?? 0);
        const netPaid = Number(((cashPaidNum + digitalPaidNum) - changeAmountNum).toFixed(2));

        if (Math.abs(netPaid - totalCalculated) > 0.10) {
          throw new BadRequestException(
            `Inconsistencia financiera en el pago: El importe pagado neto (S/ ${netPaid.toFixed(2)}) no coincide con el total de la venta (S/ ${totalCalculated.toFixed(2)}). Detalle: Efectivo S/ ${cashPaidNum.toFixed(2)} + Digital S/ ${digitalPaidNum.toFixed(2)} - Vuelto S/ ${changeAmountNum.toFixed(2)}`,
          );
        }

        // Reglas de negocio y antifraude por método de pago:
        if (dto.paymentMethod === 'CASH') {
          if (digitalPaidNum > 0) {
            throw new BadRequestException('Para pagos en EFECTIVO puro, el monto digital debe ser S/ 0.00');
          }
          // Permitir redondeo legal a favor del cliente de hasta S/ 0.10 (ej. cuenta de S/ 10.03 pagada con S/ 10.00)
          if (totalCalculated - cashPaidNum > 0.10) {
            throw new BadRequestException(
              `Efectivo entregado (S/ ${cashPaidNum.toFixed(2)}) es insuficiente para cubrir el total de S/ ${totalCalculated.toFixed(2)}`,
            );
          }
        } else if (dto.paymentMethod === 'TRANSFER' || dto.paymentMethod === 'CARD') {
          if (cashPaidNum > 0 || changeAmountNum > 0) {
            throw new BadRequestException(
              `Para pagos con ${dto.paymentMethod === 'TRANSFER' ? 'TRANSFERENCIA / BILLETERA DIGITAL' : 'TARJETA'}, no se permite registrar efectivo ni vuelto.`,
            );
          }
          if (Math.abs(digitalPaidNum - totalCalculated) > 0.01) {
            throw new BadRequestException(
              `El monto digital pagado (S/ ${digitalPaidNum.toFixed(2)}) no coincide con el total de la venta (S/ ${totalCalculated.toFixed(2)})`,
            );
          }
        } else if (dto.paymentMethod === 'MIXED') {
          if (digitalPaidNum > totalCalculated) {
            throw new BadRequestException(
              `En pago MIXTO, el monto digital (S/ ${digitalPaidNum.toFixed(2)}) no puede exceder el total de la venta (S/ ${totalCalculated.toFixed(2)}).`,
            );
          }
          if (changeAmountNum > cashPaidNum) {
            throw new BadRequestException(
              `En pago MIXTO, el vuelto (S/ ${changeAmountNum.toFixed(2)}) no puede ser mayor al efectivo entregado (S/ ${cashPaidNum.toFixed(2)}). No se permite entregar vuelto en efectivo sobre cobros digitales.`,
            );
          }
        }

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

        // 3. Bifurcación del Flujo de Venta y Estado Inicial
        let isFiscal = false;
        let taxableBase = 0;
        let igvAmount = 0;
        let emissionStatus: EmissionStatus | null = null;

        if (receiptType === ReceiptType.NOTA_VENTA) {
          // VÍA 1: NOTA DE VENTA / TICKET INTERNO (Prioridad Operativa - Despacho Ultrarrápido)
          isFiscal = false;
          taxableBase = totalTaxableBase;
          igvAmount = 0;
          emissionStatus = null;
        } else {
          // VÍAS 2 & 3: BOLETA Y FACTURA ELECTRÓNICA (Fiscal)
          // Se guarda inicialmente en estado PENDING para no retener la transacción de base de datos
          isFiscal = true;
          taxableBase = totalTaxableBase;
          igvAmount = totalIgv;
          emissionStatus = EmissionStatus.PENDING;
        }

        // 4. Crear la Venta y sus Detalles de forma atómica en la base de datos local
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
            hash: null,
            qrString: null,
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

        // 5. Descontar stock atómicamente evitando Lost Update por concurrencia
        for (const item of validatedItems) {
          const updatedProduct = await tx.product.update({
            where: { id: item.product.id },
            data: {
              currentStock: { decrement: new Prisma.Decimal(item.quantity) },
            },
          });

          // Registrar movimiento en Kardex de tipo SALIDA (SALE) con trazabilidad total
          await tx.kardexMovement.create({
            data: {
              productId: item.product.id,
              movementType: MovementType.SALE,
              quantity: new Prisma.Decimal(item.quantity),
              previousStock: new Prisma.Decimal(Number(updatedProduct.currentStock) + item.quantity),
              newStock: updatedProduct.currentStock,
              unitCost: item.product.costPrice,
              referenceId: sale.id,
              reason: `Venta POS [${fullReceiptNumber}] - ${shift.cashRegister.name}`,
              userId,
            },
          });
        }

        return {
          sale,
          isFiscal,
          receiptType,
          series,
          correlativeNumber,
          fullReceiptNumber,
          totalCalculated,
          taxableBase,
          igvAmount,
          validatedItems,
        };
      },
      {
        timeout: 10000,
      },
    );

    // =========================================================================
    // ETAPA 2: INTEGRACIÓN CON MOTOR DE FACTURACIÓN (FUERA DE LA TRANSACCIÓN DB)
    // =========================================================================
    let finalSale = txResult.sale;

    if (txResult.isFiscal) {
      const storeConfig = await this.prisma.storeConfig.findFirst();
      try {
        const billingRes = await this.billingService.issueReceipt({
          receiptType: txResult.receiptType as 'BOLETA' | 'FACTURA',
          series: txResult.series,
          correlativeNumber: txResult.correlativeNumber,
          totalAmount: txResult.totalCalculated,
          taxableBase: txResult.taxableBase,
          igvAmount: txResult.igvAmount,
          customerName:
            dto.customerName ||
            (txResult.receiptType === ReceiptType.BOLETA ? 'CLIENTES VARIOS' : ''),
          customerDocument: dto.customerDocument,
          customerAddress: dto.customerAddress,
          customerEmail: dto.customerEmail?.trim() || null,
          paymentMethod: dto.paymentMethod,
          companyRuc: storeConfig?.ruc || '10458923011',
          items: txResult.validatedItems.map((vi: any) => ({
            name: vi.product.name,
            quantity: vi.quantity,
            unitPrice: vi.unitPrice,
            subtotal: vi.subtotalItem,
            unitType: vi.product.unitType,
          })),
        });

        if (billingRes.success) {
          const finalEmissionStatus =
            (billingRes.emissionStatus as EmissionStatus) || EmissionStatus.ACCEPTED;
          finalSale = await this.prisma.sale.update({
            where: { id: txResult.sale.id },
            data: {
              hash: billingRes.hash,
              qrString: billingRes.qrString,
              emissionStatus: finalEmissionStatus,
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
        } else {
          // El PSE reportó rechazo formal
          finalSale = await this.prisma.sale.update({
            where: { id: txResult.sale.id },
            data: {
              emissionStatus: EmissionStatus.REJECTED,
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
          this.logger.error(
            `[BILLING] Comprobante ${txResult.fullReceiptNumber} rechazado por PSE: ${billingRes.message}`,
          );
        }
      } catch (billingErr: any) {
        // En caso de caída de conexión o timeout con Nubefact
        finalSale = await this.prisma.sale.update({
          where: { id: txResult.sale.id },
          data: {
            emissionStatus: EmissionStatus.REJECTED,
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
        this.logger.error(
          `[BILLING] Excepción de conexión emitiendo comprobante fiscal ${txResult.fullReceiptNumber}: ${billingErr.message}`,
        );
      }
    }

    return {
      message: txResult.isFiscal
        ? `Comprobante electrónico (${txResult.receiptType}) procesado: ${txResult.fullReceiptNumber}`
        : `Nota de venta interna registrada con éxito: ${txResult.fullReceiptNumber}`,
      sale: {
        ...finalSale,
        totalAmount: Number(finalSale.totalAmount),
        taxableBase: Number(finalSale.taxableBase),
        igvAmount: Number(finalSale.igvAmount),
        cashPaid: Number(finalSale.cashPaid),
        digitalPaid: Number(finalSale.digitalPaid),
        changeAmount: Number(finalSale.changeAmount),
        items: finalSale.items.map((i: any) => ({
          ...i,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
          subtotal: Number(i.subtotal),
        })),
      },
    };
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

    // =========================================================================
    // ETAPA 1: TRANSACCIÓN DB LOCAL (Atómica y Rápida: Reingreso de stock y anulación)
    // =========================================================================
    const txResult = await this.prisma.$transaction(
      async (tx) => {
        let createdCreditNote: any = null;
        let ncSeries = '';
        let ncCorrelative = 0;
        let ncFullNumber = '';
        let reasonCode = '01';
        let reasonDescription = 'ANULACIÓN DE LA OPERACIÓN';

        // Si es Boleta o Factura, reservar correlativo y registrar Nota de Crédito en DB
        if (isFiscal) {
          const ncReceiptType =
            sale.receiptType === ReceiptType.BOLETA
              ? ReceiptType.NOTA_CREDITO_BOLETA
              : ReceiptType.NOTA_CREDITO_FACTURA;

          const registerIdentifier = sale.cashShift.cashRegister.identifier;
          const registerName = sale.cashShift.cashRegister.name;
          ncSeries = this.getSeriesForRegister(
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

          ncCorrelative = sequence.currentNumber;
          ncFullNumber = `${ncSeries}-${String(ncCorrelative).padStart(8, '0')}`;
          reasonCode = dto.reasonCode || '01';
          reasonDescription =
            dto.reasonDescription ||
            (reasonCode === '01'
              ? 'ANULACIÓN DE LA OPERACIÓN'
              : reasonCode === '02'
                ? 'ANULACIÓN POR ERROR EN EL RUC'
                : reasonCode === '06'
                  ? 'DEVOLUCIÓN TOTAL'
                  : dto.reason);

          createdCreditNote = await tx.creditNote.create({
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
              hash: null,
              qrString: null,
              emissionStatus: EmissionStatus.PENDING,
              adminId: admin.id,
              cashShiftId: sale.cashShiftId,
            },
          });
        }

        // Reingresar stock a Kardex de forma atómica para evitar Lost Updates
        for (const item of sale.items) {
          const qtyToReturn = Number(item.quantity);

          // Devolver stock atómicamente con Prisma increment
          const updatedProduct = await tx.product.update({
            where: { id: item.productId },
            data: {
              currentStock: { increment: new Prisma.Decimal(qtyToReturn) },
            },
          });

          // Registrar devolución en Kardex con balance exacto
          const reasonText = ncFullNumber
            ? `Nota de Crédito ${ncFullNumber} [Anula ${sale.fullReceiptNumber || sale.saleNumber}] - Motivo: ${dto.reason}`
            : `Anulación de venta #${sale.saleNumber} - Motivo: ${dto.reason}`;

          await tx.kardexMovement.create({
            data: {
              productId: item.productId,
              movementType: MovementType.RETURN_SALE,
              quantity: new Prisma.Decimal(qtyToReturn),
              previousStock: new Prisma.Decimal(Number(updatedProduct.currentStock) - qtyToReturn),
              newStock: updatedProduct.currentStock,
              unitCost: updatedProduct.costPrice,
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
          voided,
          createdCreditNote,
          isFiscal,
          ncSeries,
          ncCorrelative,
          ncFullNumber,
          reasonCode,
          reasonDescription,
        };
      },
      { timeout: 10000 },
    );

    // =========================================================================
    // ETAPA 2: INTEGRACIÓN CON NUBEFACT / SUNAT (FUERA DE LA TRANSACCIÓN DB)
    // =========================================================================
    let creditNoteResult: any = null;

    if (txResult.isFiscal && txResult.createdCreditNote) {
      const storeConfig = await this.prisma.storeConfig.findFirst();
      try {
        const billingRes = await this.billingService.issueCreditNote({
          saleId: sale.id,
          receiptType: sale.receiptType as 'BOLETA' | 'FACTURA',
          creditNoteSeries: txResult.ncSeries,
          creditNoteCorrelative: txResult.ncCorrelative,
          modifiedReceiptType: sale.receiptType as 'BOLETA' | 'FACTURA',
          modifiedDocTypeCode: sale.receiptType === ReceiptType.FACTURA ? '01' : '03',
          modifiedSeries: sale.series,
          modifiedCorrelative: sale.correlativeNumber,
          modifiedFullNumber:
            sale.fullReceiptNumber ||
            `${sale.series}-${String(sale.correlativeNumber).padStart(8, '0')}`,
          reasonCode: txResult.reasonCode,
          reasonDescription: txResult.reasonDescription,
          customReason: dto.reason,
          totalAmount: Number(sale.totalAmount),
          taxableBase: Number(sale.taxableBase),
          igvAmount: Number(sale.igvAmount),
          customerName:
            sale.customerName ||
            (sale.receiptType === ReceiptType.FACTURA ? 'EMPRESA' : 'CLIENTES VARIOS'),
          customerDocument: sale.customerDocument,
          customerAddress: sale.customerAddress,
          customerEmail: sale.customerEmail?.trim() || null,
          companyRuc: storeConfig?.ruc || '10458923011',
          items: sale.items.map((i) => ({
            name: i.product.name,
            quantity: Number(i.quantity),
            unitPrice: Number(i.unitPrice),
            subtotal: Number(i.subtotal),
            unitType: i.product.unitType,
          })),
          createdAt: new Date(),
        });

        if (billingRes.success) {
          const finalEmissionStatus =
            (billingRes.emissionStatus as EmissionStatus) || EmissionStatus.ACCEPTED;

          const updatedNc = await this.prisma.creditNote.update({
            where: { id: txResult.createdCreditNote.id },
            data: {
              hash: billingRes.hash,
              qrString: billingRes.qrString,
              emissionStatus: finalEmissionStatus,
              externalId: billingRes.externalId,
              pdfUrl: billingRes.pdfUrl,
              xmlUrl: billingRes.xmlUrl,
              cdrUrl: billingRes.cdrUrl,
            },
          });

          creditNoteResult = {
            id: updatedNc.id,
            series: updatedNc.series,
            correlativeNumber: updatedNc.correlativeNumber,
            fullNumber: updatedNc.fullNumber,
            reasonCode: updatedNc.reasonCode,
            reasonDescription: updatedNc.reasonDescription,
            customReason: updatedNc.customReason,
            taxableBase: Number(updatedNc.taxableBase),
            igvAmount: Number(updatedNc.igvAmount),
            totalAmount: Number(updatedNc.totalAmount),
            hash: updatedNc.hash,
            qrString: updatedNc.qrString,
            emissionStatus: updatedNc.emissionStatus,
            createdAt: updatedNc.createdAt,
          };
        } else {
          creditNoteResult = {
            ...txResult.createdCreditNote,
            taxableBase: Number(txResult.createdCreditNote.taxableBase),
            igvAmount: Number(txResult.createdCreditNote.igvAmount),
            totalAmount: Number(txResult.createdCreditNote.totalAmount),
            emissionStatus: EmissionStatus.PENDING,
          };
        }
      } catch (billingErr: any) {
        this.logger.error(
          `[voidSale] Error al contactar PSE/SUNAT para Nota de Crédito ${txResult.ncFullNumber}: ${billingErr.message}. La anulación local y stock se preservan.`,
        );
        creditNoteResult = {
          ...txResult.createdCreditNote,
          taxableBase: Number(txResult.createdCreditNote.taxableBase),
          igvAmount: Number(txResult.createdCreditNote.igvAmount),
          totalAmount: Number(txResult.createdCreditNote.totalAmount),
          emissionStatus: EmissionStatus.PENDING,
        };
      }
    }

    return {
      message: creditNoteResult
        ? `Nota de Crédito ${creditNoteResult.fullNumber} emitida con éxito. Venta anulada y stock devuelto a inventario.`
        : 'Venta anulada correctamente. Stock devuelto a inventario.',
      saleId: txResult.voided.id,
      saleNumber: txResult.voided.saleNumber,
      authorizedBy: admin.name,
      creditNote: creditNoteResult,
    };
  }

  /**
   * Canje de Nota de Venta (Ticket Interno) a Comprobante Electrónico (Boleta o Factura)
   * Válido ante SUNAT sin duplicar salidas de stock ni ingresos de caja.
   */
  async convertSaleReceipt(
    saleId: string,
    currentUserId: string,
    dto: ConvertSaleReceiptDto,
  ) {
    const { targetReceiptType, customerDocument, customerName, customerAddress, customerEmail } = dto;

    if (
      targetReceiptType !== ReceiptType.BOLETA &&
      targetReceiptType !== ReceiptType.FACTURA
    ) {
      throw new BadRequestException(
        'El comprobante destino solo puede ser BOLETA o FACTURA.',
      );
    }

    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
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

    if (!sale) {
      throw new NotFoundException('Venta no encontrada para canjear comprobante.');
    }

    if (sale.isVoided) {
      throw new BadRequestException('No se puede canjear una venta que se encuentra anulada.');
    }

    if (sale.receiptType !== ReceiptType.NOTA_VENTA) {
      throw new BadRequestException(
        `Solo las Notas de Venta (Tickets internos) pueden ser canjeadas. Esta venta ya fue emitida como ${sale.receiptType}.`,
      );
    }

    if (sale.voidedReason && sale.voidedReason.startsWith('CANJE_TICKET:')) {
      throw new BadRequestException(
        'Este ticket ya fue canjeado previamente a comprobante electrónico.',
      );
    }

    const totalCalculated = Number(sale.totalAmount);

    // 1. Validaciones tributarias según SUNAT
    const trimmedDoc = customerDocument ? customerDocument.trim() : '';
    const trimmedName = customerName ? customerName.trim() : '';

    if (targetReceiptType === ReceiptType.FACTURA) {
      const validRucPrefixes = ['10', '20', '15', '17'];
      const hasValidPrefix = validRucPrefixes.some((prefix) => trimmedDoc.startsWith(prefix));
      if (!/^\d{11}$/.test(trimmedDoc) || !hasValidPrefix) {
        throw new BadRequestException(
          'Para emitir una Factura Electrónica se requiere un RUC válido de 11 dígitos que inicie con 10, 20, 15 o 17.',
        );
      }
      if (!trimmedName || trimmedName === 'Cliente Varios') {
        throw new BadRequestException(
          'Para Factura Electrónica es obligatorio ingresar la Razón Social de la empresa.',
        );
      }
    } else if (targetReceiptType === ReceiptType.BOLETA) {
      if (totalCalculated >= 700) {
        if (!trimmedDoc || (trimmedDoc.length !== 8 && trimmedDoc.length !== 11)) {
          throw new BadRequestException(
            'Para Boletas con monto mayor o igual a S/ 700.00, es obligatorio consignar el DNI o RUC del cliente según normativa SUNAT.',
          );
        }
        if (!trimmedName) {
          throw new BadRequestException(
            'Para Boletas con monto mayor o igual a S/ 700.00, se requieren los nombres y apellidos completos del cliente.',
          );
        }
      }
    }

    // 2. Determinar la Caja Registradora para la Serie
    // Buscamos si el usuario actual tiene un turno abierto; si no, usamos la caja de la venta original
    const activeShift = await this.prisma.cashShift.findFirst({
      where: { userId: currentUserId, status: ShiftStatus.OPEN },
      include: { cashRegister: true },
    });

    const cashRegister = activeShift ? activeShift.cashRegister : sale.cashShift.cashRegister;
    const cashRegisterId = cashRegister.id;
    const series = this.getSeriesForRegister(
      cashRegister.identifier,
      cashRegister.name,
      targetReceiptType,
    );

    // 3. Cálculo de base imponible e IGV
    const taxableBase = Math.round((totalCalculated / 1.18) * 100) / 100;
    const igvAmount = Math.round((totalCalculated - taxableBase) * 100) / 100;
    const originalTicketNumber =
      sale.fullReceiptNumber || `${sale.series}-${String(sale.correlativeNumber).padStart(8, '0')}`;

    // 4. Transacción atómica: incremento seguro de correlativo y actualización de la venta
    const txResult = await this.prisma.$transaction(
      async (tx) => {
        const sequence = await tx.receiptSequence.upsert({
          where: { series },
          create: {
            cashRegisterId,
            receiptType: targetReceiptType,
            series,
            currentNumber: 1,
          },
          update: {
            currentNumber: { increment: 1 },
          },
        });

        const correlativeNumber = sequence.currentNumber;
        const fullReceiptNumber = `${series}-${String(correlativeNumber).padStart(8, '0')}`;

        const updatedSale = await tx.sale.update({
          where: { id: sale.id },
          data: {
            receiptType: targetReceiptType,
            series,
            correlativeNumber,
            fullReceiptNumber,
            isFiscal: true,
            taxableBase: new Prisma.Decimal(taxableBase),
            igvAmount: new Prisma.Decimal(igvAmount),
            customerDocument: trimmedDoc || null,
            customerName:
              trimmedName ||
              (targetReceiptType === ReceiptType.BOLETA ? 'Clientes Varios' : 'EMPRESA'),
            customerAddress: customerAddress?.trim() || null,
            customerEmail: customerEmail?.trim() || null,
            emissionStatus: EmissionStatus.PENDING,
            // Registramos trazabilidad del ticket canjeado
            voidedReason: `CANJE_TICKET:${originalTicketNumber}`,
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
          updatedSale,
          series,
          correlativeNumber,
          fullReceiptNumber,
        };
      },
      { timeout: 10000 },
    );

    // 5. Emisión Electrónica con el Motor PSE / Mock SUNAT (fuera de la transacción DB)
    let finalSale = txResult.updatedSale;
    const storeConfig = await this.prisma.storeConfig.findFirst();

    try {
      const billingRes = await this.billingService.issueReceipt({
        receiptType: targetReceiptType as 'BOLETA' | 'FACTURA',
        series: txResult.series,
        correlativeNumber: txResult.correlativeNumber,
        totalAmount: totalCalculated,
        taxableBase,
        igvAmount,
        customerName:
          trimmedName ||
          (targetReceiptType === ReceiptType.BOLETA ? 'CLIENTES VARIOS' : 'EMPRESA'),
        customerDocument: trimmedDoc || undefined,
        customerAddress: customerAddress?.trim() || undefined,
        customerEmail: customerEmail?.trim() || undefined,
        paymentMethod: sale.paymentMethod,
        companyRuc: storeConfig?.ruc || '10458923011',
        items: sale.items.map((item) => ({
          name: item.product.name,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          subtotal: Number(item.subtotal),
          unitType: item.product.unitType,
        })),
      });

      if (billingRes.success) {
        const finalStatus =
          (billingRes.emissionStatus as EmissionStatus) || EmissionStatus.ACCEPTED;
        finalSale = await this.prisma.sale.update({
          where: { id: sale.id },
          data: {
            hash: billingRes.hash,
            qrString: billingRes.qrString,
            emissionStatus: finalStatus,
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
      }
    } catch (err: any) {
      this.logger.error(
        `[convertSaleReceipt] Error emitiendo con PSE/SUNAT para canje ${txResult.fullReceiptNumber}: ${err.message}`,
      );
    }

    return {
      message: `Ticket ${originalTicketNumber} canjeado exitosamente por ${targetReceiptType === ReceiptType.BOLETA ? 'Boleta Electrónica' : 'Factura Electrónica'} ${finalSale.fullReceiptNumber}`,
      originalTicketNumber,
      sale: finalSale,
    };
  }

  /**
   * Buscar ticket de venta por número de comprobante completo o correlativo
   * para facilitar el canje de comprobantes de turnos pasados.
   */
  async findTicketByNumber(ticketNumber: string) {
    const cleanNum = ticketNumber.trim().toUpperCase();

    const sale = await this.prisma.sale.findFirst({
      where: {
        OR: [
          { fullReceiptNumber: cleanNum },
          { fullReceiptNumber: { contains: cleanNum, mode: 'insensitive' } },
        ],
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
      orderBy: { createdAt: 'desc' },
    });

    if (!sale) {
      throw new NotFoundException(
        `No se encontró ningún ticket de venta con el número "${ticketNumber}".`,
      );
    }

    return sale;
  }

  /**
   * Historial de ventas con control de visibilidad por rol
   * Soporta filtro por rango de fechas (mes completo) y turno sin truncamiento arbitrario
   */
  async getSales(
    userRole: Role,
    filter?: {
      shiftId?: string;
      isVoided?: boolean;
      startDate?: string;
      endDate?: string;
      limit?: number;
      search?: string;
    },
  ) {
    const where: Prisma.SaleWhereInput = {};

    if (filter?.shiftId) where.cashShiftId = filter.shiftId;
    if (filter?.isVoided !== undefined) where.isVoided = filter.isVoided;

    if (filter?.search) {
      const term = filter.search.trim();
      where.OR = [
        { fullReceiptNumber: { contains: term, mode: 'insensitive' } },
        { customerName: { contains: term, mode: 'insensitive' } },
        { customerDocument: { contains: term, mode: 'insensitive' } },
      ];
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
        where.createdAt = dateFilter;
      }
    }

    const take = filter?.limit
      ? filter.limit
      : !filter?.startDate && !filter?.endDate && !filter?.shiftId
        ? 100
        : undefined;

    const sales = await this.prisma.sale.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...(take !== undefined ? { take } : {}),
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
      const netCashFromSale = calculateNetCashFromSale(s);
      cashPaidTotal += netCashFromSale;
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
        cashPaid: netCashFromSale,
        grossCashPaid: Number(s.cashPaid),
        changeAmount: Number(s.changeAmount || 0),
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
        const txResult = await this.prisma.$transaction(
          async (tx) => {
            let totalCalculated = 0;
            let totalTaxableBase = 0;
            let totalIgv = 0;
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
              const itemValorTotal = Number((subtotalItem / 1.18).toFixed(2));
              const itemIgv = Number((subtotalItem - itemValorTotal).toFixed(2));

              totalCalculated += subtotalItem;
              totalTaxableBase += itemValorTotal;
              totalIgv += itemIgv;

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
            totalTaxableBase = Number(totalTaxableBase.toFixed(2));
            totalIgv = Number(totalIgv.toFixed(2));
            const totalAmountDecimal = new Prisma.Decimal(totalCalculated);

            // Validar cuadre financiero con tolerancia de redondeo BCRP (S/ 0.10) también en sincronización offline
            const offCash = Number(offlineSale.cashPaid ?? 0);
            const offDigital = Number(offlineSale.digitalPaid ?? 0);
            const offChange = Number(offlineSale.changeAmount ?? 0);
            const offNetPaid = Number(((offCash + offDigital) - offChange).toFixed(2));

            if (Math.abs(offNetPaid - totalCalculated) > 0.10) {
              throw new BadRequestException(
                `Venta offline [${offlineSale.offlineId}] rechazada por descuadre financiero: Importe neto pagado S/ ${offNetPaid.toFixed(2)} difiere del total S/ ${totalCalculated.toFixed(2)} por más de S/ 0.10`,
              );
            }

            const saleDate = offlineSale.createdAt ? new Date(offlineSale.createdAt) : new Date();

            const receiptType = offlineSale.receiptType || ReceiptType.NOTA_VENTA;
            const isFiscal = receiptType !== ReceiptType.NOTA_VENTA;
            const taxableBase = totalTaxableBase;
            const igvAmount = isFiscal ? totalIgv : 0;

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

            // 1. Guardar la venta en base de datos local de forma inmediata (con emisión PENDING si es fiscal)
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
                customerEmail: offlineSale.customerEmail?.trim() || null,
                hash: null,
                qrString: null,
                emissionStatus: isFiscal ? EmissionStatus.PENDING : null,
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

            // 2. Actualizar stock atómicamente y registrar en Kardex con fecha original
            for (const item of validatedItems) {
              const updatedProduct = await tx.product.update({
                where: { id: item.product.id },
                data: {
                  currentStock: { decrement: new Prisma.Decimal(item.quantity) },
                },
              });

              await tx.kardexMovement.create({
                data: {
                  productId: item.product.id,
                  movementType: MovementType.SALE,
                  quantity: new Prisma.Decimal(item.quantity),
                  previousStock: new Prisma.Decimal(Number(updatedProduct.currentStock) + item.quantity),
                  newStock: updatedProduct.currentStock,
                  unitCost: item.product.costPrice,
                  referenceId: sale.id,
                  reason: `Venta POS Offline #${sale.saleNumber} [OFFLINE:${offlineSale.offlineId}] - ${targetShift.cashRegister.name}`,
                  userId,
                  createdAt: saleDate,
                },
              });
            }

            // 3. Si el turno ya fue cerrado previamente, reconciliar retroactivamente el arqueo físico
            if (targetShift.status === ShiftStatus.CLOSED) {
              // Calculamos el efectivo neto aquí mismo para no depender de funciones externas
              const netCash =
                sale.paymentMethod === 'TRANSFER' || sale.paymentMethod === 'CARD'
                  ? 0
                  : Math.max(0, Number(sale.cashPaid) - Number(sale.changeAmount || 0));

              if (netCash > 0) {
                await tx.cashShift.update({
                  where: { id: targetShift.id },
                  data: {
                    expectedBalance: { increment: new Prisma.Decimal(netCash) },
                    ...(targetShift.difference !== null
                      ? { difference: { decrement: new Prisma.Decimal(netCash) } }
                      : {}),
                  },
                });
              }
            }

            return {
              sale,
              isFiscal,
              receiptType,
              series,
              correlativeNumber,
              totalCalculated,
              taxableBase,
              igvAmount,
              validatedItems,
              saleDate,
            };
          },
          { timeout: 10000 },
        );

        // =========================================================================
        // ETAPA 2: INTEGRACIÓN CON MOTOR DE FACTURACIÓN (FUERA DE LA TRANSACCIÓN DB)
        // =========================================================================
        let finalSale = txResult.sale;

        if (txResult.isFiscal) {
          const storeConfig = await this.prisma.storeConfig.findFirst();
          try {
            const billingRes = await this.billingService.issueReceipt({
              receiptType: txResult.receiptType as 'BOLETA' | 'FACTURA',
              series: txResult.series,
              correlativeNumber: txResult.correlativeNumber,
              totalAmount: txResult.totalCalculated,
              taxableBase: txResult.taxableBase,
              igvAmount: txResult.igvAmount,
              customerName: offlineSale.customerName || 'CLIENTES VARIOS',
              customerDocument: offlineSale.customerDocument,
              customerAddress: offlineSale.customerAddress,
              customerEmail: offlineSale.customerEmail?.trim() || null,
              paymentMethod: offlineSale.paymentMethod,
              companyRuc: storeConfig?.ruc || '10458923011',
              items: txResult.validatedItems.map((vi: any) => ({
                name: vi.product.name,
                quantity: vi.quantity,
                unitPrice: vi.unitPrice,
                subtotal: vi.subtotalItem,
                unitType: vi.product.unitType,
              })),
              createdAt: txResult.saleDate,
            });

            if (billingRes.success) {
              const finalEmissionStatus =
                (billingRes.emissionStatus as EmissionStatus) || EmissionStatus.ACCEPTED;

              finalSale = await this.prisma.sale.update({
                where: { id: txResult.sale.id },
                data: {
                  hash: billingRes.hash,
                  qrString: billingRes.qrString,
                  emissionStatus: finalEmissionStatus,
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
            }
          } catch (billingErr: any) {
            this.logger.error(
              `[syncOfflineSales] Error de facturación para venta offline [${offlineSale.offlineId}]: ${billingErr.message}. La venta se preserva localmente con estado PENDING.`,
            );
          }
        }

        results.push({
          offlineId: offlineSale.offlineId,
          success: true,
          sale: {
            ...finalSale,
            totalAmount: Number(finalSale.totalAmount),
            taxableBase: Number(finalSale.taxableBase),
            igvAmount: Number(finalSale.igvAmount),
            cashPaid: Number(finalSale.cashPaid),
            digitalPaid: Number(finalSale.digitalPaid),
            changeAmount: Number(finalSale.changeAmount),
            items: finalSale.items.map((i: any) => ({
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

