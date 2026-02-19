import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProductVariantDto {
  @ApiProperty({ description: 'Variant price', example: 99.99 })
  @IsNumber()
  price!: number;

  @ApiProperty({ description: 'Variant stock quantity', example: 100 })
  @IsNumber()
  stock!: number;

  @ApiProperty({ description: 'Stock Keeping Unit', example: 'SUMMER-DRESS-BLUE-M' })
  @IsString()
  sku!: string;
}

export class UpdateProductImageDto {
  @ApiPropertyOptional({ description: 'Image ID (for existing images)', example: 1 })
  @IsOptional()
  @IsNumber()
  id?: number;

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

export class UpdateProductDto {
  @ApiPropertyOptional({ description: 'Product name', example: 'Summer Dress Updated' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Product description', example: 'Updated description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Whether the product is active', example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Category ID', example: 2 })
  @IsOptional()
  @IsNumber()
  categoryId?: number;

  @ApiPropertyOptional({
    description: 'Product variants with attributes',
    type: [UpdateProductVariantDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateProductVariantDto)
  variants?: UpdateProductVariantDto[];

  @ApiPropertyOptional({
    description: 'Product images',
    type: [UpdateProductImageDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateProductImageDto)
  images?: UpdateProductImageDto[];
}
