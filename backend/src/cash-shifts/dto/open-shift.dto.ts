import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class OpenShiftDto {
  @IsString({ message: 'El ID de la caja física es obligatorio' })
  @IsNotEmpty({ message: 'Debe seleccionar una caja física' })
  cashRegisterId: string;

  @IsNumber({}, { message: 'El monto inicial en efectivo debe ser un número' })
  @Min(0, { message: 'El monto inicial no puede ser negativo' })
  initialBalance: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
