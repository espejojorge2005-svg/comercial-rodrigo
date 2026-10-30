import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UnitType } from '@prisma/client';

export class BulkProductItemDto {
  @IsOptional()
  @IsString()
  barcode?: string;

  @IsString({ message: 'El nombre del producto es obligatorio' })
  @IsNotEmpty({ message: 'El nombre del producto no puede estar vacío' })
  name: string;

  @IsOptional()
  @IsString()
  categoryName?: string;

  @IsOptional()
  @IsEnum(UnitType)
  unitType?: UnitType;

  @IsNumber({}, { message: 'El costo debe ser numérico' })
  @Min(0, { message: 'El costo no puede ser negativo' })
  costPrice: number;

  @IsNumber({}, { message: 'El precio al por menor debe ser numérico' })
  @IsPositive({ message: 'El precio al por menor debe ser mayor a 0' })
  retailPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  wholesalePrice?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0.001)
  wholesaleMinQty?: number | null;

  @IsNumber({}, { message: 'El stock inicial debe ser numérico' })
  @Min(0, { message: 'El stock inicial no puede ser negativo' })
  currentStock: number;

  @IsNumber({}, { message: 'El stock mínimo debe ser numérico' })
  @Min(0, { message: 'El stock mínimo no puede ser negativo' })
  minStock: number;

  @IsOptional()
  @IsString()
  expirationDate?: string | null;
}

export class BulkImportProductsDto {
  @IsArray({ message: 'La lista de productos debe ser un arreglo' })
  @ValidateNested({ each: true })
  @Type(() => BulkProductItemDto)
  products: BulkProductItemDto[];
}
