import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class CreateAttributeDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}

export class UpdateAttributeDto {
  @IsString()
  @IsOptional()
  name?: string;
}
