import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  Matches,
} from 'class-validator';
import { Role } from '@prisma/client';

export class CreateUserDto {
  @IsString({ message: 'El nombre es obligatorio' })
  @IsNotEmpty({ message: 'El nombre no puede estar vacío' })
  name: string;

  @IsString({ message: 'El nombre de usuario es obligatorio' })
  @IsNotEmpty({ message: 'El nombre de usuario no puede estar vacío' })
  @Matches(/^[a-zA-Z0-9._@-]+$/, {
    message: 'El usuario solo puede contener letras, números, puntos, guiones o arroba',
  })
  username: string;

  @IsString({ message: 'La contraseña es obligatoria' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password: string;

  @IsEnum(Role, { message: 'El rol debe ser ADMIN o CAJERO' })
  role: Role;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4,6}$/, { message: 'El PIN debe ser de 4 a 6 dígitos numéricos' })
  pin?: string;
}
