import { Type } from 'class-transformer';
import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsString,
  IsArray,
} from 'class-validator';

export class CategoryProductsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  // Filter by minimum price
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPrice?: number;

  // Filter by maximum price
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  minMaxPrice?: number;

  // Filter by sizes (comma-separated or array)
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sizes?: string[];

  // Filter by colors (comma-separated or array)
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  colors?: string[];

  // Sort options: newest, price-asc, price-desc, name-asc, name-desc
  @IsOptional()
  @IsString()
  sortBy?: 'newest' | 'price-asc' | 'price-desc' | 'name-asc' | 'name-desc' =
    'newest';
}
