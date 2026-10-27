import { Module } from '@nestjs/common';
import { SalesService } from './sales.service.js';
import { SalesController } from './sales.controller.js';
import { AuthModule } from '../auth/auth.module.js';
import { BillingModule } from '../billing/billing.module.js';

import { SalesSequenceService } from './services/sales-sequence.service.js';
import { SalesOfflineService } from './services/sales-offline.service.js';

@Module({
  imports: [AuthModule, BillingModule],
  controllers: [SalesController],
  providers: [SalesService, SalesSequenceService, SalesOfflineService],
  exports: [SalesService, SalesSequenceService, SalesOfflineService],
})
export class SalesModule {}
