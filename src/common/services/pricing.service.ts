/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface PricingResult {
  basePrice: number;
  finalPrice: number;
  hasDiscount: boolean;
  discountAmount: number;
  discountType: 'PERCENTAGE' | 'FIXED' | null;
}

export interface OrderItemPricing {
  variantId: number;
  quantity: number;
  price: number;
  originalPrice: number;
  discountAmount: number | null;
  discountPercentage: number | null;
  reservationId: number | null;
  itemTotal: number;
}

@Injectable()
export class PricingService {
  constructor(private prisma: PrismaService) {}

  /**
   * Calculate variant pricing with discount validation
   * Used for consistent price calculation across all endpoints
   * This replaces duplicate logic in product.service.ts and order.service.ts
   */
  calculateVariantPricing(variant: any, now: Date): PricingResult {
    const basePrice = Number(variant.price);
    let finalPrice = basePrice;
    let hasDiscount = false;
    let discountAmount = 0;

    // Pre-calc dates outside discount check
    const discountStart = variant.discountStart
      ? new Date(variant.discountStart)
      : null;
    const discountEnd = variant.discountEnd
      ? new Date(variant.discountEnd)
      : null;

    // Validate discount values - must be > 0
    const discountValue =
      variant.discountValue && Number(variant.discountValue) > 0
        ? Number(variant.discountValue)
        : 0;

    // Check if discount is active with proper validation
    const isDiscountActive =
      variant.discountType &&
      discountValue > 0 &&
      (!discountStart || now >= discountStart) &&
      (!discountEnd || now <= discountEnd);

    if (isDiscountActive) {
      hasDiscount = true;

      if (variant.discountType === 'PERCENTAGE') {
        // Clamp percentage to max 100%
        const clampedPercentage = Math.min(100, discountValue);
        discountAmount = (basePrice * clampedPercentage) / 100;
      } else if (variant.discountType === 'FIXED') {
        // Clamp fixed discount to not exceed base price
        discountAmount = Math.min(basePrice, discountValue);
      }

      finalPrice = Math.max(0, basePrice - discountAmount);
    }

    return {
      basePrice,
      finalPrice,
      hasDiscount,
      discountAmount,
      discountType: hasDiscount ? variant.discountType : null,
    };
  }

  /**
   * Calculate order item pricing for a single item
   * Used in order.service.ts for both create() and createGuest() methods
   * This replaces duplicate discount calculation in order.service.ts
   */
  calculateOrderItemPricing(
    variant: any,
    quantity: number,
    reservationId?: number | null,
  ): OrderItemPricing {
    // Calculate discount
    const basePrice = Number(variant.price);
    let finalPrice = basePrice;
    let discountAmount = 0;
    let discountPercentage: number | null = null;

    // Check if discount is active (same logic as calculateVariantPricing)
    const now = new Date();
    if (
      variant.discountType &&
      variant.discountValue &&
      (!variant.discountStart || now >= new Date(variant.discountStart)) &&
      (!variant.discountEnd || now <= new Date(variant.discountEnd))
    ) {
      const discountValue = Number(variant.discountValue);
      if (variant.discountType === 'PERCENTAGE') {
        discountAmount = (basePrice * discountValue) / 100;
        discountPercentage = discountValue;
      } else if (variant.discountType === 'FIXED') {
        discountAmount = discountValue;
      }
      finalPrice = Math.max(0, basePrice - discountAmount);
    }

    const itemTotal = finalPrice * quantity;

    return {
      variantId: variant.id,
      quantity,
      price: finalPrice,
      originalPrice: basePrice,
      discountAmount: discountAmount || null,
      discountPercentage,
      reservationId: reservationId || null,
      itemTotal,
    };
  }

  /**
   * Calculate total with delivery charge
   * Used in order.service.ts for both create() and createGuest() methods
   */
  calculateOrderTotal(itemTotals: number[], deliveryCharge: number): number {
    let total = itemTotals.reduce((sum, itemTotal) => sum + itemTotal, 0);
    total += deliveryCharge;
    return total;
  }
}
