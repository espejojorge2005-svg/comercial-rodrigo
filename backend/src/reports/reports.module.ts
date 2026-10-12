import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service.js';
import { ReportsController } from './reports.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
