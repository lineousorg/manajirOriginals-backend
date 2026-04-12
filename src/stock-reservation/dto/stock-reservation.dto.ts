import { IsNumber, IsOptional, Min, IsString } from 'class-validator';
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

  /**
   * Guest phone number - used for guest users to identify themselves
   * If provided, the reservation will be associated with a guest user account
   */
  @IsOptional()
  @IsString()
  guestPhone?: string;
}

export class ReleaseReservationDto {
  @IsNumber()
  @Type(() => Number)
  reservationId!: number;

  /**
   * Guest phone number - used for guest users to release their reservations
   */
  @IsOptional()
  @IsString()
  guestPhone?: string;
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
