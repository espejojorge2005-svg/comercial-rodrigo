import { Controller, Post, Get, Body, Param, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { SalesService } from './sales.service.js';
import { CreateSaleDto } from './dto/create-sale.dto.js';
import { VoidSaleDto } from './dto/void-sale.dto.js';
import { SyncOfflineSalesBatchDto } from './dto/sync-offline-sales.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@UseGuards(JwtAuthGuard)
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  async createSale(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateSaleDto,
  ) {
    return this.salesService.createSale(userId, dto);
  }

  @Post('sync-offline')
  async syncOfflineSales(
    @CurrentUser('id') userId: string,
    @Body() dto: SyncOfflineSalesBatchDto,
  ) {
    return this.salesService.syncOfflineSales(userId, dto);
  }

  @Post(':id/void')
  async voidSale(
    @Param('id') id: string,
    @Body() dto: VoidSaleDto,
  ) {
    return this.salesService.voidSale(id, dto);
  }

  @Get('profit-report')
  async getProfitReport(
    @CurrentUser('role') userRole: Role,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('shiftId') shiftId?: string,
  ) {
    if (userRole !== Role.ADMIN) {
      throw new ForbiddenException('Solo el administrador puede visualizar el reporte de ganancias.');
    }
    return this.salesService.getProfitReport({ startDate, endDate, shiftId });
  }

  @Get()
  async getSales(
    @CurrentUser('role') userRole: Role,
    @Query('shiftId') shiftId?: string,
    @Query('isVoided') isVoided?: string,
  ) {
    const isVoidedBool =
      isVoided !== undefined ? isVoided === 'true' : undefined;
    return this.salesService.getSales(userRole, { shiftId, isVoided: isVoidedBool });
  }
}

