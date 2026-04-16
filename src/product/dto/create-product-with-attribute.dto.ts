import {
  IsString,
  IsNumber,
  IsArray,
  ValidateNested,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DiscountType } from '@prisma/client';

export class VariantAttributeDto {
  @IsNumber()
  attributeId!: number;

  @IsNumber()
  valueId!: number;
}

export class VariantWithAttributesDto {
  @IsString()
  @IsOptional()
  sku?: string;

  @IsNumber()
  price!: number;

  @IsNumber()
  stock!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantAttributeDto)
  attributes!: VariantAttributeDto[];
}

export class CreateProductWithAttributesDto {
  @IsString()
  name!: string;

  @IsString()
  description!: string;

  @IsString()
  slug!: string;

  @IsNumber()
  categoryId!: number;

  @IsOptional()
  isActive?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantWithAttributesDto)
  variants!: VariantWithAttributesDto[];
}
