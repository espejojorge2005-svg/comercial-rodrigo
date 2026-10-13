import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';
import { UnitType } from '@prisma/client';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  barcode?: string;

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
  wholesalePrice?: number | null;

  @IsOptional()
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
  @IsDateString({}, { message: 'La fecha de vencimiento debe tener un formato válido (YYYY-MM-DD)' })
  expirationDate?: string | null;
}
