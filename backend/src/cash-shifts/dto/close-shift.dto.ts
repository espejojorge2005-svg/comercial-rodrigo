import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CloseShiftDto {
  @IsString({ message: 'El ID del turno es obligatorio' })
  @IsNotEmpty()
  shiftId: string;

  @IsNumber({}, { message: 'El dinero físico contado en arqueo ciego debe ser un número' })
  @Min(0, { message: 'El dinero contado no puede ser negativo' })
  actualBalance: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
