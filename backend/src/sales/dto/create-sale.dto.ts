import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod, ReceiptType } from '@prisma/client';

const SALE_RECEIPT_TYPES: ReceiptType[] = [
  ReceiptType.NOTA_VENTA,
  ReceiptType.BOLETA,
  ReceiptType.FACTURA,
];

export class SaleItemDto {
  @IsString({ message: 'El ID del producto es obligatorio' })
  @IsNotEmpty()
  productId: string;

  @IsNumber({}, { message: 'La cantidad debe ser numérica' })
  @IsPositive({ message: 'La cantidad debe ser mayor a 0' })
  quantity: number;

  @IsNumber({}, { message: 'El precio unitario debe ser numérico' })
  @IsPositive({ message: 'El precio unitario debe ser mayor a 0' })
  unitPrice: number;

  @IsBoolean()
  @IsOptional()
  isWholesaleApplied?: boolean;
}

export class CreateSaleDto {
  @IsString({ message: 'El ID del turno de caja es obligatorio' })
  @IsNotEmpty()
  cashShiftId: string;

  @IsOptional()
  @IsIn(SALE_RECEIPT_TYPES, {
    message: 'El tipo de comprobante de venta debe ser NOTA_VENTA, BOLETA o FACTURA',
  })
  receiptType?: ReceiptType;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customerDocument?: string;

  @IsOptional()
  @IsString()
  customerAddress?: string;

  @IsOptional()
  @IsString()
  customerEmail?: string;

  @IsEnum(PaymentMethod, {
    message: 'El método de pago debe ser CASH, TRANSFER, CARD o MIXED',
  })
  paymentMethod: PaymentMethod;

  @IsNumber()
  @Min(0)
  cashPaid: number;

  @IsNumber()
  @Min(0)
  digitalPaid: number;

  @IsNumber()
  @Min(0)
  changeAmount: number;

  @IsOptional()
  @IsString({ message: 'El PIN de administrador debe ser una cadena de texto' })
  adminPin?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'La venta debe incluir al menos un producto' })
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];
}
