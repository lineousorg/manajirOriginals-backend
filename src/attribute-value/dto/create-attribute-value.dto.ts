import { IsNotEmpty, IsString, IsOptional, IsNumber } from 'class-validator';

export class CreateAttributeValueDto {
  @IsString()
  @IsNotEmpty()
  value!: string;

  @IsNumber()
  @IsNotEmpty()
  attributeId!: number;
}

export class UpdateAttributeValueDto {
  @IsString()
  @IsOptional()
  value?: string;
}
