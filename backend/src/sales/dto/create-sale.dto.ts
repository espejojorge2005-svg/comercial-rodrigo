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
  isWholesaleApplied: boolean;
}

export class CreateSaleDto {
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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];
}
