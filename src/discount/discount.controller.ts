import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  IsBoolean,
  IsEnum,
  Min,
  Max,
  IsDateString,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { DiscountService } from './discount.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PaginationQueryDto } from '../common/dto/pagination.dto';

class CreateDiscountDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsEnum(['PERCENTAGE', 'FIXED'])
  type!: 'PERCENTAGE' | 'FIXED';

  @IsNumber()
  @Min(0)
  value!: number;

  @IsOptional()
  @IsEnum(['ALL_PRODUCTS', 'SPECIFIC_CATEGORY', 'SPECIFIC_VARIANTS'])
  target?: 'ALL_PRODUCTS' | 'SPECIFIC_CATEGORY' | 'SPECIFIC_VARIANTS';

  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDiscountAmt?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsNumber()
  categoryId?: number;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  variantIds?: number[];

  @IsOptional()
  @IsNumber()
  maxUsage?: number;
}

class UpdateDiscountDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsEnum(['PERCENTAGE', 'FIXED'])
  type?: 'PERCENTAGE' | 'FIXED';

  @IsOptional()
  @IsNumber()
  @Min(0)
  value?: number;

  @IsOptional()
  @IsEnum(['ALL_PRODUCTS', 'SPECIFIC_CATEGORY', 'SPECIFIC_VARIANTS'])
  target?: 'ALL_PRODUCTS' | 'SPECIFIC_CATEGORY' | 'SPECIFIC_VARIANTS';

  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDiscountAmt?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsNumber()
  categoryId?: number;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  variantIds?: number[];

  @IsOptional()
  @IsNumber()
  maxUsage?: number;
}

@Controller('discounts')
export class DiscountController {
  constructor(private readonly discountService: DiscountService) {}

  /**
   * Create a new discount (Admin only)
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async create(@Body() dto: CreateDiscountDto) {
    return this.discountService.create(dto);
  }

  /**
   * Get all discounts with pagination (Admin)
   */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async findAll(@Query() query: PaginationQueryDto) {
    return this.discountService.findAll(query);
  }

  /**
   * Get active discounts (Public)
   */
  @Get('active')
  async getActive() {
    return this.discountService.getActive();
  }

  /**
   * Get a single discount by ID (Admin)
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async findOne(@Param('id') id: string) {
    return this.discountService.findOne(parseInt(id));
  }

  /**
   * Update a discount (Admin only)
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async update(@Param('id') id: string, @Body() dto: UpdateDiscountDto) {
    return this.discountService.update(parseInt(id), dto);
  }

  /**
   * Delete a discount (Admin only)
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async delete(@Param('id') id: string) {
    return this.discountService.delete(parseInt(id));
  }
}
