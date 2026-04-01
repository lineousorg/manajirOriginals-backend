import { IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ReserveStockDto {
  @IsNumber()
  @Type(() => Number)
  variantId!: number;

  @IsNumber()
  @Min(1)
  @Type(() => Number)
  quantity!: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  expirationMinutes?: number;
}

export class ReleaseReservationDto {
  @IsNumber()
  @Type(() => Number)
  reservationId!: number;
}

export class CheckAvailabilityDto {
  @IsNumber()
  @Type(() => Number)
  variantId!: number;

  @IsNumber()
  @Min(1)
  @Type(() => Number)
  quantity!: number;
}
