import { IsNumber, IsOptional, IsBoolean } from 'class-validator';

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
}
