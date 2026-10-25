import { IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class VoidSaleDto {
  @IsString({ message: 'El PIN de administrador debe ser una cadena' })
  @IsNotEmpty({ message: 'El PIN de administrador es obligatorio' })
  @Length(4, 6, { message: 'El PIN de administrador debe tener entre 4 y 6 dígitos' })
  adminPin: string;

  @IsString({ message: 'El motivo de anulación es obligatorio' })
  @IsNotEmpty({ message: 'Debe justificar el motivo de la anulación' })
  reason: string;

  @IsOptional()
  @IsString()
  reasonCode?: string; // Catálogo 09 SUNAT (ej: "01", "02", "06")

  @IsOptional()
  @IsString()
  sunatReasonCode?: string; // Alias de compatibilidad para catálogo 09

  @IsOptional()
  @IsString()
  reasonDescription?: string;
}

