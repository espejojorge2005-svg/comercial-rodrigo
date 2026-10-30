import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';
import { UnitType } from '@prisma/client';

export class UpdateProductDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  barcode?: string | null;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsEnum(UnitType)
  unitType?: UnitType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  retailPrice?: number;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsNumber({}, { message: 'El precio mayorista debe ser numérico' })
  @Min(0, { message: 'El precio mayorista no puede ser negativo' })
  wholesalePrice?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsNumber({}, { message: 'La cantidad mínima mayorista debe ser numérica' })
  @Min(0.001, { message: 'La cantidad mínima mayorista debe ser mayor a 0' })
  wholesaleMinQty?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  currentStock?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minStock?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsDateString({}, { message: 'La fecha de vencimiento debe tener un formato válido (YYYY-MM-DD)' })
  expirationDate?: string | null;
}
