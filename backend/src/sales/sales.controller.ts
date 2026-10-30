import { Controller, Post, Get, Body, Param, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { SalesService } from './sales.service.js';
import { CreateSaleDto } from './dto/create-sale.dto.js';
import { VoidSaleDto } from './dto/void-sale.dto.js';
import { ConvertSaleReceiptDto } from './dto/convert-receipt.dto.js';
import { SyncOfflineSalesBatchDto } from './dto/sync-offline-sales.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@UseGuards(JwtAuthGuard)
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  async createSale(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: Role,
    @Body() dto: CreateSaleDto,
  ) {
    return this.salesService.createSale(userId, dto, userRole);
  }

  @Post('sync-offline')
  async syncOfflineSales(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: Role,
    @Body() dto: SyncOfflineSalesBatchDto,
  ) {
    return this.salesService.syncOfflineSales(userId, dto, userRole);
  }

  @Post(':id/void')
  async voidSale(
    @Param('id') id: string,
    @Body() dto: VoidSaleDto,
  ) {
    return this.salesService.voidSale(id, dto);
  }

  @Post(':id/convert-receipt')
  async convertReceipt(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ConvertSaleReceiptDto,
  ) {
    return this.salesService.convertSaleReceipt(id, userId, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post('reemit-pending-batch')
  async reemitPendingBatch() {
    return this.salesService.reemitPendingBatch();
  }

  @Post(':id/reemit-pending')
  async reemitPendingSale(@Param('id') id: string) {
    return this.salesService.reemitPendingSale(id);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post(':id/reemit-credit-note')
  async reemitCreditNote(@Param('id') id: string) {
    return this.salesService.reemitCreditNote(id);
  }

  @Get('ticket/:ticketNumber')
  async findTicket(@Param('ticketNumber') ticketNumber: string) {
    return this.salesService.findTicketByNumber(ticketNumber);
  }

  @Get('lookup-document/:doc')
  async lookupDocument(@Param('doc') doc: string) {
    return this.salesService.lookupDocument(doc);
  }

  @Get()
  async getSales(
    @CurrentUser('role') userRole: Role,
    @Query('shiftId') shiftId?: string,
    @Query('isVoided') isVoided?: string,
    @Query('receiptType') receiptType?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    const isVoidedBool =
      isVoided !== undefined ? isVoided === 'true' : undefined;
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    const safeLimit =
      parsedLimit && !Number.isNaN(parsedLimit) && parsedLimit > 0
        ? userRole === Role.ADMIN
          ? Math.min(parsedLimit, 5000)
          : Math.min(parsedLimit, 300)
        : undefined;

    return this.salesService.getSales(userRole, {
      shiftId,
      isVoided: isVoidedBool,
      receiptType,
      startDate,
      endDate,
      limit: safeLimit,
      search,
    });
  }
}
