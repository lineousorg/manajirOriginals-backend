import { VariantWithAttributesDto } from './create-product-with-attribute.dto';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProductImageDto {
  @ApiProperty({ description: 'Image URL (Base64 string)', example: 'data:image/png;base64,...' })
  @IsString()
  url!: string;

  @ApiPropertyOptional({ description: 'Alternative text for the image', example: 'Product image' })
  @IsOptional()
  @IsString()
  altText?: string;

  @ApiPropertyOptional({ description: 'Position of the image in the gallery', example: 1 })
  @IsOptional()
  @IsNumber()
  position?: number;
}

export class CreateProductDto {
  @ApiProperty({ description: 'Product name', example: 'Summer Dress' })
  @IsString()
  name!: string;

  @ApiProperty({ description: 'Product description', example: 'Beautiful summer dress for women' })
  @IsString()
  description!: string;

  @ApiProperty({ description: 'Product URL slug', example: 'summer-dress' })
  @IsString()
  slug!: string;

  @ApiProperty({ description: 'Category ID', example: 1 })
  @IsNumber()
  categoryId!: number;

  @ApiPropertyOptional({ description: 'Whether the product is active', example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Product variants with attributes',
    type: [VariantWithAttributesDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantWithAttributesDto)
  variants?: VariantWithAttributesDto[];

  @ApiPropertyOptional({
    description: 'Product images',
    type: [CreateProductImageDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductImageDto)
  @IsOptional()
  images?: CreateProductImageDto[];
}
