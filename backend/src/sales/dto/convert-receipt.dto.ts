import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ReceiptType } from '@prisma/client';

export class ConvertSaleReceiptDto {
  @IsEnum(ReceiptType, {
    message: 'El tipo de comprobante de destino debe ser BOLETA o FACTURA',
  })
  @IsNotEmpty({ message: 'El tipo de comprobante es obligatorio' })
  targetReceiptType: ReceiptType;

  @IsOptional()
  @IsString()
  customerDocument?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customerAddress?: string;

  @IsOptional()
  @IsString()
  customerEmail?: string;
}
