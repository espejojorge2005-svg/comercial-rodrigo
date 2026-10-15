import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { Role } from '@prisma/client';

export class UpdateUserDto {
  @IsOptional()
  @IsString({ message: 'El nombre debe ser texto' })
  name?: string;

  @IsOptional()
  @IsString({ message: 'El nombre de usuario debe ser texto' })
  @Matches(/^[a-zA-Z0-9._@-]+$/, {
    message: 'El usuario solo puede contener letras, números, puntos, guiones o arroba',
  })
  username?: string;

  @IsOptional()
  @IsEnum(Role, { message: 'El rol debe ser ADMIN o CAJERO' })
  role?: Role;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4,6}$/, { message: 'El PIN debe ser de 4 a 6 dígitos numéricos' })
  pin?: string;

  @IsOptional()
  @IsBoolean({ message: 'El estado activo debe ser verdadero o falso' })
  isActive?: boolean;
}
