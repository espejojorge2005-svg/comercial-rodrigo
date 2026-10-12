import { Module } from '@nestjs/common';
import { BillingService } from './billing.service.js';
import { MockBillingDriver } from './drivers/mock-billing.driver.js';
import { NubefactBillingDriver } from './drivers/nubefact-billing.driver.js';

@Module({
  providers: [MockBillingDriver, NubefactBillingDriver, BillingService],
  exports: [BillingService],
})
export class BillingModule {}
