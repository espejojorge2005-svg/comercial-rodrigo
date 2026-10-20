import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from './auth.service.js';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let authService: AuthService;
  let mockPrisma: any;
  let mockJwtService: any;

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    };

    mockJwtService = {
      sign: vi.fn().mockReturnValue('mocked-jwt-token'),
    };

    authService = new AuthService(mockPrisma, mockJwtService);
  });

  describe('login', () => {
    it('debe iniciar sesión exitosamente con credenciales válidas', async () => {
      const hashedPassword = await bcrypt.hash('password123', 10);
      const mockUser = {
        id: 'user-1',
        name: 'Rodrigo Admin',
        username: 'admin',
        password: hashedPassword,
        role: Role.ADMIN,
        isActive: true,
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await authService.login({
        username: 'admin',
        password: 'password123',
      });

      expect(result).toHaveProperty('access_token', 'mocked-jwt-token');
      expect(result.user).toEqual({
        id: 'user-1',
        name: 'Rodrigo Admin',
        username: 'admin',
        role: Role.ADMIN,
      });
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: 'user-1',
        username: 'admin',
        role: Role.ADMIN,
      });
    });

    it('debe lanzar UnauthorizedException si el usuario no existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.login({ username: 'nonexistent', password: 'password123' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('debe lanzar UnauthorizedException si el usuario está inactivo', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-2',
        username: 'inactivo',
        password: 'any',
        isActive: false,
      });

      await expect(
        authService.login({ username: 'inactivo', password: 'password123' }),
      ).rejects.toThrow('La cuenta de usuario está desactivada');
    });

    it('debe lanzar UnauthorizedException si la contraseña es incorrecta', async () => {
      const hashedPassword = await bcrypt.hash('correct_password', 10);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-3',
        username: 'cajero',
        password: hashedPassword,
        isActive: true,
      });

      await expect(
        authService.login({ username: 'cajero', password: 'wrong_password' }),
      ).rejects.toThrow('Credenciales incorrectas');
    });
  });

  describe('verifyAdminPin', () => {
    it('debe validar exitosamente un PIN de Administrador correcto', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'admin-1',
        name: 'Don Rodrigo',
        username: 'rodrigo',
      });

      const result = await authService.verifyAdminPin({ pin: '1234' });

      expect(result).toEqual({
        valid: true,
        adminId: 'admin-1',
        adminName: 'Don Rodrigo',
      });
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          role: Role.ADMIN,
          isActive: true,
          pin: '1234',
        },
        select: {
          id: true,
          name: true,
          username: true,
        },
      });
    });

    it('debe lanzar UnauthorizedException si el PIN es incorrecto o de usuario inactivo', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        authService.verifyAdminPin({ pin: '9999' }),
      ).rejects.toThrow('PIN de administrador inválido');
    });
  });

  describe('getProfile', () => {
    it('debe retornar el perfil del usuario si existe', async () => {
      const userProfile = {
        id: 'user-1',
        name: 'Admin',
        username: 'admin',
        role: Role.ADMIN,
        isActive: true,
        createdAt: new Date(),
      };
      mockPrisma.user.findUnique.mockResolvedValue(userProfile);

      const result = await authService.getProfile('user-1');
      expect(result).toEqual(userProfile);
    });

    it('debe lanzar UnauthorizedException si el usuario no existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(authService.getProfile('unknown')).rejects.toThrow('Usuario no encontrado');
    });
  });

  describe('updateProfile', () => {
    it('debe actualizar el nombre correctamente', async () => {
      const existingUser = {
        id: 'user-1',
        name: 'Old Name',
        username: 'cajero1',
        role: Role.CAJERO,
        password: 'hashedpassword',
      };
      mockPrisma.user.findUnique.mockResolvedValueOnce(existingUser);
      mockPrisma.user.update.mockResolvedValue({
        ...existingUser,
        name: 'New Name',
      });

      const result = await authService.updateProfile('user-1', { name: 'New Name' });
      expect(result.name).toBe('New Name');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({ name: 'New Name' }),
        }),
      );
    });

    it('debe rechazar si el nuevo nombre de usuario ya está en uso', async () => {
      const existingUser = {
        id: 'user-1',
        username: 'cajero1',
      };
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(existingUser) // find user
        .mockResolvedValueOnce({ id: 'user-2', username: 'cajero2' }); // check username conflict

      await expect(
        authService.updateProfile('user-1', { username: 'cajero2' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe validar la contraseña actual antes de asignar una nueva', async () => {
      const currentHash = await bcrypt.hash('oldPassword', 10);
      const existingUser = {
        id: 'user-1',
        username: 'cajero1',
        password: currentHash,
      };
      mockPrisma.user.findUnique.mockResolvedValue(existingUser);

      // Falla si no envía contraseña actual
      await expect(
        authService.updateProfile('user-1', { newPassword: 'newPassword123' }),
      ).rejects.toThrow('Debes ingresar tu contraseña actual para establecer una nueva.');

      // Falla si la contraseña actual no coincide
      await expect(
        authService.updateProfile('user-1', {
          currentPassword: 'wrongOldPassword',
          newPassword: 'newPassword123',
        }),
      ).rejects.toThrow('La contraseña actual es incorrecta.');
    });
  });
});
