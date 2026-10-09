import { Controller, Post, Get, Body, Param, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { SalesService } from './sales.service.js';
import { CreateSaleDto } from './dto/create-sale.dto.js';
import { VoidSaleDto } from './dto/void-sale.dto.js';
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

  @Post(':id/void')
  async voidSale(
    @Param('id') id: string,
    @Body() dto: VoidSaleDto,
  ) {
    return this.salesService.voidSale(id, dto);
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
