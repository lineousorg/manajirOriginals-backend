import { IsNumber, IsArray, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class AttributeValueDto {
  @IsNumber()
  attributeId!: number;

  @IsNumber()
  valueId!: number;
}

export class CreateVariantWithAttributesDto {
  @IsOptional()
  sku?: string;

  @IsNumber()
  price!: number;

  @IsNumber()
  stock!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttributeValueDto)
  attributes!: AttributeValueDto[];
}
