import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';
import { UnitType } from '@prisma/client';

export class CreateProductDto {
  @IsOptional()
  @IsString()
  barcode?: string;

  @IsString({ message: 'El nombre del producto es obligatorio' })
  @IsNotEmpty({ message: 'El nombre del producto no puede estar vacío' })
  name: string;

  @IsString({ message: 'La categoría es obligatoria' })
  @IsNotEmpty()
  categoryId: string;

  @IsEnum(UnitType, { message: 'El tipo de unidad debe ser válido (SA, BX, PK, NIU, KG, LT)' })
  unitType: UnitType;

  @IsNumber({}, { message: 'El costo debe ser numérico' })
  @Min(0, { message: 'El costo no puede ser negativo' })
  costPrice: number;

  @IsNumber({}, { message: 'El precio al por menor debe ser numérico' })
  @IsPositive({ message: 'El precio al por menor debe ser mayor a 0' })
  retailPrice: number;

  @IsOptional()
  @IsNumber({}, { message: 'El precio al por mayor debe ser numérico' })
  @Min(0, { message: 'El precio al por mayor no puede ser negativo' })
  wholesalePrice?: number | null;

  @IsOptional()
  @IsNumber({}, { message: 'La cantidad mínima para precio mayor debe ser numérica' })
  @Min(1, { message: 'La cantidad mínima debe ser al menos 1' })
  wholesaleMinQty?: number | null;

  @IsNumber({}, { message: 'El stock actual debe ser numérico' })
  @Min(0, { message: 'El stock no puede ser negativo' })
  currentStock: number;

  @IsNumber({}, { message: 'El stock mínimo debe ser numérico' })
  @Min(0, { message: 'El stock mínimo no puede ser negativo' })
  minStock: number;
}
