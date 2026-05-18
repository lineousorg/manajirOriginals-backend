import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
  IsArray,
  IsEnum,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DiscountType } from '@prisma/client';
import { ProductHasVariants } from './validators/product-has-variants.validator';
import { VariantHasAttributes } from './validators/variant-has-attributes.validator';

export class UpdateProductVariantDto {
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

  // Discount fields
  @IsOptional()
  @IsEnum(DiscountType)
  discountType?: DiscountType;

  @IsOptional()
  @IsNumber()
  discountValue?: number;

  @IsOptional()
  @IsDateString()
  discountStart?: string;

  @IsOptional()
  @IsDateString()
  discountEnd?: string;

  /**
   * For creating new variants with attributes
   * Array of { attributeId, valueId } for variant attributes
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantAttributeDto)
  attributes?: VariantAttributeDto[];
}

export class VariantAttributeDto {
  @IsNumber()
  attributeId!: number;

  @IsNumber()
  valueId!: number;
}

export class UpdateProductImageDto {
  @IsOptional()
  @IsNumber()
  id?: number;

  @IsString()
  url!: string;

  @IsOptional()
  @IsString()
  publicId?: string;

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
  @IsString()
  productDetailsHtml?: string;

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
  @Type(() => UpdateProductVariantDto)
  @ProductHasVariants({
    message:
      'Product must have at least one variant when variants are provided',
  })
  @VariantHasAttributes({ each: true })
  variants?: UpdateProductVariantDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateProductImageDto)
  images?: UpdateProductImageDto[];
}
