import { Controller, Post, Get, Put, Body, UseGuards, Ip } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { VerifyPinDto } from './dto/verify-pin.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { CurrentUser } from './decorators/current-user.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() loginDto: LoginDto, @Ip() clientIp?: string) {
    return this.authService.login(loginDto, clientIp);
  }

  @UseGuards(JwtAuthGuard)
  @Post('verify-pin')
  async verifyPin(
    @Body() verifyPinDto: VerifyPinDto,
    @CurrentUser('id') requesterId?: string,
    @Ip() clientIp?: string,
  ) {
    return this.authService.verifyAdminPin(verifyPinDto, requesterId || clientIp);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@CurrentUser('id') userId: string) {
    return this.authService.getProfile(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Put('profile')
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(userId, dto);
  }
}
