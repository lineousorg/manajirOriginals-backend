/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  IsInt,
  IsNotEmpty,
  IsArray,
  IsOptional,
  IsEnum,
  Min,
  ArrayMinSize,
  ValidateNested,
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

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Order must have at least one item' })
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod = PaymentMethod.CASH_ON_DELIVERY;

  @IsInt()
  @IsOptional()
  addressId?: number;

  @IsEnum(DeliveryType)
  @IsOptional()
  deliveryType?: DeliveryType = DeliveryType.INSIDE_DHAKA;

  /**
   * Optional discount ID to apply to the order
   */
  @IsOptional()
  @IsInt()
  discountId?: number;
}
