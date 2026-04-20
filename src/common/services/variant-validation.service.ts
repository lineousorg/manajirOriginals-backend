/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ValidatedVariant {
  id: number;
  sku: string;
  price: number;
  stock: number;
  isActive: boolean;
  isDeleted: boolean;
  product: {
    id: number;
    name: string;
    slug: string;
  };
}

@Injectable()
export class VariantValidationService {
  constructor(private prisma: PrismaService) {}

  /**
   * Validate that a variant exists and is active/not deleted
   * Used in stock-reservation.service.ts and order.service.ts
   * This replaces duplicate validation logic
   */
  async validateVariant(variantId: number): Promise<ValidatedVariant> {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!variant) {
      throw new NotFoundException(`Variant with ID ${variantId} not found`);
    }

    if (variant.isDeleted) {
      throw new BadRequestException('This variant has been deleted');
    }

    if (!variant.isActive) {
      throw new BadRequestException('This variant is not active');
    }

    return variant as unknown as ValidatedVariant;
  }

  /**
   * Validate multiple variants at once
   * Returns all valid variants or throws error for first invalid one
   * Used in order.service.ts for validating order items
   */
  async validateVariants(variantIds: number[]): Promise<ValidatedVariant[]> {
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (variants.length !== variantIds.length) {
      const foundIds = variants.map((v) => v.id);
      const missingIds = variantIds.filter((id) => !foundIds.includes(id));
      throw new NotFoundException(
        `One or more product variants not found: ${missingIds.join(', ')}`,
      );
    }

    // Check for invalid variants
    const invalidVariants = variants.filter((v) => v.isDeleted || !v.isActive);

    if (invalidVariants.length > 0) {
      const invalidIds = invalidVariants.map((v) => v.id).join(', ');
      throw new BadRequestException(
        `Cannot order from deleted or inactive variants: ${invalidIds}`,
      );
    }

    return variants as unknown as ValidatedVariant[];
  }

  /**
   * Check if stock is available for a given quantity (atomic check)
   * Returns the current stock level after the check
   * Used in stock-reservation.service.ts and order.service.ts
   */
  async checkAndDecrementStock(
    tx: any,
    variantId: number,
    quantity: number,
  ): Promise<{ success: boolean; availableStock: number }> {
    // Atomic update: only decrement if stock is sufficient
    const result = await tx.productVariant.updateMany({
      where: {
        id: variantId,
        stock: { gte: quantity }, // Only update if stock >= quantity
      },
      data: { stock: { decrement: quantity } },
    });

    if (result.count === 0) {
      // Stock was modified by another request, fetch current state
      const currentVariant = await tx.productVariant.findUnique({
        where: { id: variantId },
        select: { stock: true },
      });
      return {
        success: false,
        availableStock: currentVariant?.stock || 0,
      };
    }

    // Get updated stock for response
    const finalVariant = await tx.productVariant.findUnique({
      where: { id: variantId },
      select: { stock: true },
    });

    return {
      success: true,
      availableStock: finalVariant?.stock || 0,
    };
  }

  /**
   * Restore stock for a variant (increment)
   * Used in stock-reservation.service.ts and order.service.ts
   */
  async restoreStock(
    tx: any,
    variantId: number,
    quantity: number,
  ): Promise<void> {
    await tx.productVariant.update({
      where: { id: variantId },
      data: { stock: { increment: quantity } },
    });
  }
}
