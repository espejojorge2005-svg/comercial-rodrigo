import { IsEnum, IsNotEmpty, IsNumber, IsPositive, IsString } from 'class-validator';
import { CashMovementType } from '@prisma/client';

export class CashMovementDto {
  @IsString({ message: 'El ID del turno es obligatorio' })
  @IsNotEmpty()
  shiftId: string;

  @IsEnum(CashMovementType, { message: 'El tipo debe ser INCOME (Ingreso) o EXPENSE (Egreso)' })
  type: CashMovementType;

  @IsNumber({}, { message: 'El monto debe ser numérico' })
  @IsPositive({ message: 'El monto debe ser mayor a cero' })
  amount: number;

  @IsString({ message: 'Debe indicar el motivo del movimiento' })
  @IsNotEmpty({ message: 'El motivo es obligatorio' })
  reason: string;
}
