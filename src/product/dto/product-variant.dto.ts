import { IsString, IsNumber } from 'class-validator';

export class CreateVariantDto {
  @IsString()
  sku!: string;

  @IsNumber()
  price!: number;

  @IsNumber()
  stock!: number;
}
