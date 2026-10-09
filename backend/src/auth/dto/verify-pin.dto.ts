import { IsNotEmpty, IsString, Length } from 'class-validator';

export class VerifyPinDto {
  @IsString({ message: 'El PIN debe ser una cadena numérica' })
  @IsNotEmpty({ message: 'El PIN es obligatorio' })
  @Length(4, 6, { message: 'El PIN de administrador debe tener entre 4 y 6 dígitos' })
  pin: string;
}
