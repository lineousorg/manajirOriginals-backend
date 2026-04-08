import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * For updating or creating variants in product update:
 * - WITH id: Update existing variant (only mutable fields)
 * - WITHOUT id: Create new variant (required fields)
 */
export class ProductVariantUpdateDto {
  @IsOptional()
  @IsNumber()
  id?: number;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsNumber()
  stock?: number;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isDeleted?: boolean;
}

export class UpdateProductImageDto {
  @IsOptional()
  @IsNumber()
  id?: number;

  @IsString()
  url!: string;

  @IsOptional()
  @IsString()
  altText?: string;

  @IsOptional()
  @IsNumber()
  position?: number;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  categoryId?: number;

  /**
   * Variants array:
   * - WITH id: Update existing variant (price/stock/sku/isActive/isDeleted)
   * - WITHOUT id: Create new variant (price/stock required, optional sku/isActive)
   * - NOT in array: Soft delete (mark isDeleted = true)
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductVariantUpdateDto)
  variants?: ProductVariantUpdateDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateProductImageDto)
  images?: UpdateProductImageDto[];
}
