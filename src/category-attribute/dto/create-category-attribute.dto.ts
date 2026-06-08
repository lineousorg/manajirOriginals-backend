import {
  IsNumber,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsArray,
} from 'class-validator';

export class CreateCategoryAttributeDto {
  @IsNumber()
  attributeId!: number;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  isVariantSelectable?: boolean;

  @IsOptional()
  @IsEnum(['ALL', 'SELECTED', 'NONE'])
  valueRestrictionMode?: 'ALL' | 'SELECTED' | 'NONE';

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  valueIds?: number[];
}

export class UpdateCategoryAttributeDto {
  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  isVariantSelectable?: boolean;

  @IsOptional()
  @IsEnum(['ALL', 'SELECTED', 'NONE'])
  valueRestrictionMode?: 'ALL' | 'SELECTED' | 'NONE';

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  valueIds?: number[];
}
