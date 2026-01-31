import { IsBoolean, IsNumber, IsOptional, IsString, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateProductVariantDto {
  @IsString()
  size!: string;

  @IsString()
  color!: string;

  @IsNumber()
  price!: number;

  @IsNumber()
  stock!: number;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsBoolean()
  isBest?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // keep this for UI simplicity
  @IsOptional()
  @IsNumber()
  categoryId?: number;

  // ✅ ADD THIS
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateProductVariantDto)
  variants?: UpdateProductVariantDto[];
}
