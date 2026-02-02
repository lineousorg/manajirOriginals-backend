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

export class CreateProductDto {
  @IsString()
  name!: string;

  @IsString()
  description!: string;

  @IsString()
  slug!: string;

  @IsNumber()
  categoryId!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantWithAttributesDto)
  variants?: VariantWithAttributesDto[];
}
