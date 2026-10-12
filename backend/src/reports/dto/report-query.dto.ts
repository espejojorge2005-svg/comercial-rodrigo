import { IsOptional, IsString } from 'class-validator';

export class ReportQueryDto {
  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  cashRegisterId?: string;

  @IsOptional()
  @IsString()
  shiftId?: string;
}
