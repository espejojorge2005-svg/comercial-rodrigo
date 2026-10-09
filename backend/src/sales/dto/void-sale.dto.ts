import { IsNotEmpty, IsString, Length } from 'class-validator';

export class VoidSaleDto {
  @IsString({ message: 'El PIN de administrador debe ser una cadena' })
  @IsNotEmpty({ message: 'El PIN de administrador es obligatorio' })
  @Length(4, 6, { message: 'El PIN de administrador debe tener entre 4 y 6 dígitos' })
  adminPin: string;

  @IsString({ message: 'El motivo de anulación es obligatorio' })
  @IsNotEmpty({ message: 'Debe justificar el motivo de la anulación' })
  reason: string;
}
