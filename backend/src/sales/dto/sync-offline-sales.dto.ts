import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class SyncOfflineSaleItemDto {
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
  isWholesaleApplied: boolean;
}

export class SyncOfflineSaleDto {
  @IsString({ message: 'El ID offline es obligatorio' })
  @IsNotEmpty()
  offlineId: string;

  @IsString({ message: 'El ID del turno de caja es obligatorio' })
  @IsNotEmpty()
  cashShiftId: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customerDocument?: string;

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

  @IsString({ message: 'La fecha de la venta offline es obligatoria' })
  @IsNotEmpty()
  createdAt: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncOfflineSaleItemDto)
  items: SyncOfflineSaleItemDto[];
}

export class SyncOfflineSalesBatchDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncOfflineSaleDto)
  sales: SyncOfflineSaleDto[];
}
