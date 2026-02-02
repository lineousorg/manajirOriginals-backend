import {
  IsString,
  IsNumber,
  IsArray,
  ValidateNested,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

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
