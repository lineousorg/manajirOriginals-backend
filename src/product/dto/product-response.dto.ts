import { Type } from 'class-transformer';
import {
  IsNumber,
  IsBoolean,
  IsOptional,
  IsObject,
  IsString,
} from 'class-validator';
import { DiscountInfo } from '../../common/services/pricing.service';

export class ProductPricingDto {
  @IsNumber()
  minPrice!: number;

  @IsNumber()
  maxPrice!: number;

  @IsNumber()
  finalMinPrice!: number;

  @IsNumber()
  finalMaxPrice!: number;

  @IsBoolean()
  hasDiscount!: boolean;

  @IsOptional()
  @IsObject()
  discount!: DiscountInfo | null;
}

export class ProductResponseDto {
  @IsNumber()
  id!: number;

  @IsString()
  name!: string;

  @IsString()
  slug!: string;

  @IsBoolean()
  isActive!: boolean;

  @IsOptional()
  @IsString()
  createdAt?: string;

  @IsOptional()
  @Type(() => Object)
  category?: {
    id: number;
    name: string;
  };

  @IsOptional()
  @IsString()
  thumbnail?: string | null;

  @IsNumber()
  totalStock!: number;

  @IsNumber()
  availableStock!: number;

  @IsNumber()
  reservedStock!: number;

  @IsBoolean()
  hasVariants!: boolean;

  @Type(() => ProductPricingDto)
  pricing!: ProductPricingDto;
}
