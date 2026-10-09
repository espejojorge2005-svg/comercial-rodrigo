import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateSettingsDto } from './dto/update-settings.dto.js';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Obtiene la configuración del negocio (Datos para ticket térmico y membrete)
   */
  async getSettings() {
    let config = await this.prisma.storeConfig.findUnique({
      where: { id: 'default' },
    });

    if (!config) {
      config = await this.prisma.storeConfig.create({
        data: {
          id: 'default',
          name: 'COMERCIAL RODRIGO',
          subtitle: 'VENTA POR MAYOR Y MENOR',
          ruc: '10458923011',
          phone: '(01) 987-654-321',
          address: 'Av. Principal 1234, Lima',
          footerText: '¡GRACIAS POR SU COMPRA! Comercial Rodrigo siempre a su servicio',
        },
      });
    }

    return config;
  }

  /**
   * Actualiza la configuración comercial (Solo Administrador)
   */
  async updateSettings(dto: UpdateSettingsDto) {
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.subtitle !== undefined) data.subtitle = dto.subtitle.trim();
    if (dto.ruc !== undefined) data.ruc = dto.ruc.trim();
    if (dto.phone !== undefined) data.phone = dto.phone.trim();
    if (dto.address !== undefined) data.address = dto.address.trim();
    if (dto.footerText !== undefined) data.footerText = dto.footerText.trim();

    return this.prisma.storeConfig.upsert({
      where: { id: 'default' },
      update: data,
      create: {
        id: 'default',
        name: dto.name || 'COMERCIAL RODRIGO',
        subtitle: dto.subtitle || 'VENTA POR MAYOR Y MENOR',
        ruc: dto.ruc || '10458923011',
        phone: dto.phone || '(01) 987-654-321',
        address: dto.address || 'Av. Principal 1234, Lima',
        footerText:
          dto.footerText || '¡GRACIAS POR SU COMPRA! Comercial Rodrigo siempre a su servicio',
      },
    });
  }
}
