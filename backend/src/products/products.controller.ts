import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ProductsService } from './products.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@UseGuards(JwtAuthGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async getProducts(
    @CurrentUser('role') userRole: Role,
    @Query('search') search?: string,
    @Query('category') categoryId?: string,
  ) {
    return this.productsService.getProducts(userRole, search, categoryId);
  }

  @Get('categories')
  async getCategories() {
    return this.productsService.getCategories();
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('kardex')
  async getKardex(@Query('productId') productId?: string) {
    return this.productsService.getKardex(productId);
  }

  @Get(':id')
  async getProduct(
    @Param('id') id: string,
    @CurrentUser('role') userRole: Role,
  ) {
    return this.productsService.getProductById(id, userRole);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post()
  async createProduct(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateProductDto,
  ) {
    return this.productsService.createProduct(dto, userId);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Put(':id')
  async updateProduct(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.updateProduct(id, dto, userId);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Delete(':id')
  async deleteProduct(@Param('id') id: string) {
    return this.productsService.deleteProduct(id);
  }
}
