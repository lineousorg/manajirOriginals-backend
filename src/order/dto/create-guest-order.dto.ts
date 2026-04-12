import {
  IsInt,
  IsNotEmpty,
  IsArray,
  IsOptional,
  IsEnum,
  IsString,
  Min,
  ArrayMinSize,
  ValidateNested,
  IsEmail,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod, DeliveryType } from '@prisma/client';

export class OrderItemDto {
  @IsInt()
  @IsNotEmpty()
  variantId!: number;

  @IsInt()
  @Min(1)
  quantity!: number;

  /**
   * Optional reservation ID if user reserved stock before ordering
   * If provided, the stock is already decremented and should not be decremented again
   */
  @IsOptional()
  @IsInt()
  reservationId?: number;
}

/**
 * Guest contact information DTO
 * Contains the contact details for the guest placing the order
 */
export class GuestContactDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsNotEmpty()
  address!: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  postalCode?: string;
}

/**
 * Create Guest Order DTO
 * Used for customers who want to order without creating an account
 */
export class CreateGuestOrderDto extends GuestContactDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Order must have at least one item' })
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod = PaymentMethod.CASH_ON_DELIVERY;

  @IsEnum(DeliveryType)
  @IsOptional()
  deliveryType?: DeliveryType = DeliveryType.INSIDE_DHAKA;

  /**
   * reCAPTCHA token for bot protection
   * Optional - will be validated if provided
   */
  @IsOptional()
  @IsString()
  recaptchaToken?: string;
}
