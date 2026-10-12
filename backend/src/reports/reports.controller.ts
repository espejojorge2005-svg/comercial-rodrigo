import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import type { Response } from 'express';
import { Role } from '@prisma/client';
import { ReportsService } from './reports.service.js';
import { ReportQueryDto } from './dto/report-query.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // =========================================================================
  // 1. ENDPOINTS TRIBUTARIOS (PARA EL CONTADOR)
  // =========================================================================

  /**
   * Vista previa de datos del Libro / Registro de Ventas (Solo Boletas y Facturas)
   */
  @Get('tax-book')
  async getTaxBook(
    @CurrentUser('role') userRole: Role,
    @Query() query: ReportQueryDto,
  ) {
    if (userRole !== Role.ADMIN) {
      throw new ForbiddenException('Solo el administrador puede visualizar el libro tributario.');
    }
    return this.reportsService.getTaxBookData(query);
  }

  /**
   * Descarga en Excel (ExcelJS) del Libro de Ventas oficial (Formato SUNAT)
   */
  @Get('tax-book/excel')
  async downloadTaxBookExcel(
    @CurrentUser('role') userRole: Role,
    @Query() query: ReportQueryDto,
    @Res() res: Response,
  ) {
    if (userRole !== Role.ADMIN) {
      throw new ForbiddenException('Solo el administrador puede exportar el libro tributario en Excel.');
    }

    const buffer = await this.reportsService.generateTaxBookExcel(query);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `Libro_Ventas_SUNAT_${dateStr}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length.toString());
    res.end(buffer);
  }

  // =========================================================================
  // 2. ENDPOINTS OPERATIVOS Y GERENCIALES (PARA LA DUEÑA)
  // =========================================================================

  /**
   * Vista previa del Reporte Gerencial consolidado (100% ingresos + rentabilidad + cuadre)
   */
  @Get('management')
  async getManagementReport(
    @CurrentUser('role') userRole: Role,
    @Query() query: ReportQueryDto,
  ) {
    if (userRole !== Role.ADMIN) {
      throw new ForbiddenException('Solo el administrador puede visualizar el reporte gerencial.');
    }
    return this.reportsService.getManagementReportData(query);
  }

  /**
   * Descarga en Excel (ExcelJS) del Reporte Gerencial consolidado (3 Hojas)
   */
  @Get('management/excel')
  async downloadManagementExcel(
    @CurrentUser('role') userRole: Role,
    @Query() query: ReportQueryDto,
    @Res() res: Response,
  ) {
    if (userRole !== Role.ADMIN) {
      throw new ForbiddenException('Solo el administrador puede exportar el reporte gerencial en Excel.');
    }

    const buffer = await this.reportsService.generateManagementExcel(query);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `Reporte_Gerencial_Rodrigo_${dateStr}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length.toString());
    res.end(buffer);
  }
}
