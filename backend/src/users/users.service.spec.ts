import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UsersService } from './users.service.js';
import { Role } from '@prisma/client';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';

describe('UsersService', () => {
  let service: UsersService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      user: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      cashShift: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };

    service = new UsersService(mockPrisma);
  });

  describe('getAllUsers', () => {
    it('debe listar usuarios enmascarando el PIN y mapeando conteos', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 'u-1',
          name: 'Rodrigo',
          username: 'admin',
          role: Role.ADMIN,
          pin: '1234',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { cashShifts: 5, sales: 20 },
        },
        {
          id: 'u-2',
          name: 'Cajero 1',
          username: 'cajero1',
          role: Role.CAJERO,
          pin: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { cashShifts: 12, sales: 150 },
        },
      ]);

      const users = await service.getAllUsers();

      expect(users).toHaveLength(2);
      expect(users[0].pin).toBe('••••');
      expect(users[0].hasPin).toBe(true);
      expect(users[0].shiftsCount).toBe(5);
      expect(users[0].salesCount).toBe(20);

      expect(users[1].pin).toBeNull();
      expect(users[1].hasPin).toBe(false);
      expect(users[1].shiftsCount).toBe(12);
      expect(users[1].salesCount).toBe(150);
    });
  });

  describe('createUser', () => {
    it('debe registrar un nuevo usuario con contraseña hasheada', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'new-u-1',
        name: 'Nuevo Cajero',
        username: 'nuevocajero',
        role: Role.CAJERO,
        isActive: true,
        createdAt: new Date(),
      });

      const result = await service.createUser({
        name: 'Nuevo Cajero',
        username: 'NuevoCajero ',
        password: 'password123',
        role: Role.CAJERO,
      });

      expect(result.id).toBe('new-u-1');
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Nuevo Cajero',
            username: 'nuevocajero',
            role: Role.CAJERO,
            pin: null,
            isActive: true,
          }),
        }),
      );
    });

    it('debe rechazar la creación si el username ya existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing-id' });

      await expect(
        service.createUser({
          name: 'Duplicado',
          username: 'admin',
          password: 'password123',
          role: Role.CAJERO,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('debe asignar PIN solo si el rol es ADMIN', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'admin-id',
        name: 'Admin User',
        username: 'adminuser',
        role: Role.ADMIN,
        isActive: true,
      });

      await service.createUser({
        name: 'Admin User',
        username: 'adminuser',
        password: 'password123',
        role: Role.ADMIN,
        pin: '4321',
      });

      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            pin: expect.stringMatching(/^\$2[aby]\$/),
          }),
        }),
      );
    });
  });

  describe('updateUser', () => {
    it('debe lanzar NotFoundException si el usuario no existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.updateUser('nonexistent', { name: 'Juan' }, 'admin-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe impedir desactivar al único Administrador activo del sistema', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'admin-1',
        role: Role.ADMIN,
        isActive: true,
      });
      mockPrisma.user.count.mockResolvedValue(1); // Solo 1 admin activo

      await expect(
        service.updateUser('admin-1', { isActive: false }, 'admin-1'),
      ).rejects.toThrow('No puedes desactivar al único Administrador activo del sistema.');
    });

    it('debe impedir degradar de rol al único Administrador activo', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'admin-1',
        role: Role.ADMIN,
        isActive: true,
      });
      mockPrisma.user.count.mockResolvedValue(1);

      await expect(
        service.updateUser('admin-1', { role: Role.CAJERO }, 'admin-1'),
      ).rejects.toThrow('No puedes degradar al único Administrador activo del sistema.');
    });

    it('debe rechazar el cambio de username si ya está tomado por otro usuario', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ id: 'u-1', username: 'cajero1', role: Role.CAJERO }) // usuario actual
        .mockResolvedValueOnce({ id: 'u-2', username: 'cajero2' }); // choque con otro usuario

      await expect(
        service.updateUser('u-1', { username: 'cajero2' }, 'admin-id'),
      ).rejects.toThrow(ConflictException);
    });

    it('debe actualizar los datos correctamente', async () => {
      const existingUser = {
        id: 'u-1',
        name: 'Nombre Antiguo',
        username: 'cajero1',
        role: Role.CAJERO,
        isActive: true,
      };
      mockPrisma.user.findUnique.mockResolvedValue(existingUser);
      mockPrisma.user.update.mockResolvedValue({
        ...existingUser,
        name: 'Nombre Nuevo',
      });

      const updated = await service.updateUser('u-1', { name: 'Nombre Nuevo' }, 'admin-id');
      expect(updated.name).toBe('Nombre Nuevo');
    });

    it('debe impedir que un Administrador desactive su propia cuenta activa aunque existan otros admins', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'admin-1',
        role: Role.ADMIN,
        isActive: true,
      });
      mockPrisma.user.count.mockResolvedValue(2);

      await expect(
        service.updateUser('admin-1', { isActive: false }, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe impedir desactivar a un colaborador con un turno de caja abierto', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'cajero-1',
        role: Role.CAJERO,
        isActive: true,
      });
      mockPrisma.cashShift.findFirst.mockResolvedValue({ id: 'shift-open-1' });

      await expect(
        service.updateUser('cajero-1', { isActive: false }, 'admin-1'),
      ).rejects.toThrow('turno de caja abierto');
    });

    it('debe limpiar el PIN al degradar un ADMIN a CAJERO', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'admin-2',
        username: 'admin2',
        role: Role.ADMIN,
        pin: '$2b$10$hashedpin',
        isActive: true,
      });
      mockPrisma.user.count.mockResolvedValue(2);
      mockPrisma.user.update.mockResolvedValue({
        id: 'admin-2',
        role: Role.CAJERO,
        isActive: true,
      });

      await service.updateUser('admin-2', { role: Role.CAJERO }, 'admin-1');

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'admin-2' },
          data: expect.objectContaining({
            role: Role.CAJERO,
            pin: null,
          }),
        }),
      );
    });
  });

  describe('changePassword', () => {
    it('debe lanzar NotFoundException si el usuario no existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.changePassword('nonexistent', 'newpass123'),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe rechazar contraseñas de menos de 6 caracteres', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u-1' });

      await expect(
        service.changePassword('u-1', '12345'),
      ).rejects.toThrow('La nueva contraseña debe tener al menos 6 caracteres.');
    });

    it('debe hashear y actualizar la contraseña correctamente', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u-1' });
      mockPrisma.user.update.mockResolvedValue({ id: 'u-1' });

      const result = await service.changePassword('u-1', 'nuevacontraseña123');

      expect(result.message).toBe('Contraseña actualizada con éxito');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u-1' },
          data: expect.objectContaining({
            password: expect.any(String),
          }),
        }),
      );
    });
  });
});
