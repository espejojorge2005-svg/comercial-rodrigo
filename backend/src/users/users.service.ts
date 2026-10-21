import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  /**
   * Obtiene la lista de todos los colaboradores y usuarios del sistema (Solo ADMIN)
   */
  async getAllUsers() {
    const users = await this.prisma.user.findMany({
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        pin: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            cashShifts: true,
            sales: true,
          },
        },
      },
    });

    return users.map((u) => ({
      id: u.id,
      name: u.name,
      username: u.username,
      role: u.role,
      hasPin: Boolean(u.pin),
      pin: u.pin ? '••••' : null,
      isActive: u.isActive,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      shiftsCount: u._count.cashShifts,
      salesCount: u._count.sales,
    }));
  }

  /**
   * Crea un nuevo usuario o empleado (Solo ADMIN)
   */
  async createUser(dto: CreateUserDto) {
    const cleanUsername = dto.username.trim().toLowerCase();

    const existing = await this.prisma.user.findUnique({
      where: { username: cleanUsername },
    });

    if (existing) {
      throw new ConflictException(
        `El nombre de usuario "${dto.username}" ya está registrado en el sistema.`,
      );
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const hashedPin =
      dto.role === Role.ADMIN && dto.pin ? await bcrypt.hash(dto.pin.trim(), 10) : null;

    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        username: cleanUsername,
        password: hashedPassword,
        role: dto.role,
        pin: hashedPin,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    return user;
  }

  /**
   * Actualiza los datos de un usuario (Solo ADMIN)
   */
  async updateUser(id: string, dto: UpdateUserDto, currentUserId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Regla de seguridad: Si se intenta desactivar a un ADMIN, validar que no sea el único activo
    if (dto.isActive === false && user.role === Role.ADMIN) {
      const activeAdmins = await this.prisma.user.count({
        where: { role: Role.ADMIN, isActive: true },
      });

      if (activeAdmins <= 1) {
        throw new BadRequestException(
          'No puedes desactivar al único Administrador activo del sistema.',
        );
      }
    }

    const data: any = {};

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }

    if (dto.username !== undefined) {
      const cleanUsername = dto.username.trim().toLowerCase();
      if (cleanUsername !== user.username) {
        const existing = await this.prisma.user.findUnique({
          where: { username: cleanUsername },
        });
        if (existing) {
          throw new ConflictException(
            `El nombre de usuario "${dto.username}" ya pertenece a otro usuario.`,
          );
        }
        data.username = cleanUsername;
      }
    }

    if (dto.role !== undefined) {
      // Regla: no puedes quitarte el rol de admin a ti mismo si eres el único
      if (user.role === Role.ADMIN && dto.role !== Role.ADMIN) {
        const activeAdmins = await this.prisma.user.count({
          where: { role: Role.ADMIN, isActive: true },
        });
        if (activeAdmins <= 1) {
          throw new BadRequestException(
            'No puedes degradar al único Administrador activo del sistema.',
          );
        }
      }
      data.role = dto.role;
    }

    if (dto.pin !== undefined) {
      data.pin = dto.pin ? await bcrypt.hash(dto.pin.trim(), 10) : null;
    }

    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        isActive: true,
        updatedAt: true,
      },
    });

    return updated;
  }

  /**
   * Cambia o resetea la contraseña de cualquier usuario (Solo ADMIN)
   */
  async changePassword(id: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (!newPassword || newPassword.length < 6) {
      throw new BadRequestException(
        'La nueva contraseña debe tener al menos 6 caracteres.',
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    });

    return { message: 'Contraseña actualizada con éxito' };
  }
}
