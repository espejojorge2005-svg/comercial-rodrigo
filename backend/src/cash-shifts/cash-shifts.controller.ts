import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CashShiftsService } from './cash-shifts.service.js';
import { OpenShiftDto } from './dto/open-shift.dto.js';
import { CloseShiftDto } from './dto/close-shift.dto.js';
import { CashMovementDto } from './dto/cash-movement.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@UseGuards(JwtAuthGuard)
@Controller('cash-shifts')
export class CashShiftsController {
  constructor(private readonly cashShiftsService: CashShiftsService) {}

  @Get('registers')
  async getRegisters() {
    return this.cashShiftsService.getCashRegisters();
  }

  @Get('active')
  async getActiveShift(@CurrentUser('id') userId: string) {
    return this.cashShiftsService.getActiveShiftForUser(userId);
  }

  @Post('open')
  async openShift(
    @CurrentUser('id') userId: string,
    @Body() dto: OpenShiftDto,
  ) {
    return this.cashShiftsService.openShift(userId, dto);
  }

  @Post('close')
  async closeShift(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: Role,
    @Body() dto: CloseShiftDto,
  ) {
    return this.cashShiftsService.closeShift(userId, userRole, dto);
  }

  @Post('movement')
  async registerMovement(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: Role,
    @Body() dto: CashMovementDto,
  ) {
    return this.cashShiftsService.registerCashMovement(userId, userRole, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('history')
  async getHistory() {
    return this.cashShiftsService.getShiftHistory();
  }
}
