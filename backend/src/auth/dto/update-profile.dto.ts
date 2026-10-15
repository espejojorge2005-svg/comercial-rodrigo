import {
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class UpdateProfileDto {
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
  @IsString()
  currentPassword?: string;

  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'La nueva contraseña debe tener al menos 6 caracteres' })
  newPassword?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4,6}$/, { message: 'El PIN debe ser de 4 a 6 dígitos numéricos' })
  pin?: string;
}
