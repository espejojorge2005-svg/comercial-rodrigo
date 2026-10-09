import { Module } from '@nestjs/common';
import { CashShiftsService } from './cash-shifts.service.js';
import { CashShiftsController } from './cash-shifts.controller.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [CashShiftsController],
  providers: [CashShiftsService],
  exports: [CashShiftsService],
})
export class CashShiftsModule {}
