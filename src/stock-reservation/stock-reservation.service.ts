/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GuestUserService } from '../guest-user/guest-user.service';

// Default reservation expiration time in minutes
export const DEFAULT_RESERVATION_MINUTES = 15;

@Injectable()
export class StockReservationService {
  constructor(
    private prisma: PrismaService,
    private guestUserService: GuestUserService,
  ) {}

  /**
   * Reserve stock for a user
   * Creates a reservation and decrements actual stock
   * Uses atomic update to prevent race conditions
   * For guest users, provide guestPhone to find or create a guest user
   */
  async reserveStock(
    userId: number | null,
    variantId: number,
    quantity: number,
    expirationMinutes: number = DEFAULT_RESERVATION_MINUTES,
    guestPhone?: string,
  ) {
    // Validate quantity
    if (quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than 0');
    }

    // For guest users, find or create guest user account
    let effectiveUserId = userId;
    if (!userId && guestPhone) {
      const guestUser = await this.guestUserService.findOrCreate({
        name: 'Guest',
        phone: guestPhone,
        address: '',
      });
      effectiveUserId = guestUser.id;
    }

    // Allow anonymous reservations - no user ID or phone required
    if (!effectiveUserId) {
      effectiveUserId = -1; // Negative ID indicates anonymous reservation
    }

    // FIX #4: Add idempotency check - prevent duplicate reservations within 10 seconds
    // Only apply for non-anonymous users (exclude userId = -1)
    if (effectiveUserId > 0) {
      const recentReservation = await this.prisma.stockReservation.findFirst({
        where: {
          variantId,
          userId: effectiveUserId,
          status: 'ACTIVE',
          expiresAt: { gt: new Date() },
          createdAt: { gte: new Date(Date.now() - 10000) }, // Last 10 seconds
        },
        select: { id: true },
      });

      if (recentReservation) {
        throw new ConflictException(
          'A reservation already exists for this item. Please wait or release it first.',
        );
      }
    }

    // FIX #5: Add max reservation limit per user (exclude anonymous)
    if (effectiveUserId > 0) {
      const MAX_RESERVATIONS_PER_USER = 5;
      const userActiveReservations = await this.prisma.stockReservation.count({
        where: {
          userId: effectiveUserId,
          status: 'ACTIVE',
          expiresAt: { gt: new Date() },
        },
      });

      if (userActiveReservations >= MAX_RESERVATIONS_PER_USER) {
        throw new BadRequestException(
          `Maximum ${MAX_RESERVATIONS_PER_USER} active reservations allowed. Please complete or release existing reservations first.`,
        );
      }
    }

    // Calculate expiration time
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + expirationMinutes);

    // Create reservation and decrement stock in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // First, validate variant exists and is active
      const variant = await tx.productVariant.findUnique({
        where: { id: variantId },
        select: { id: true, stock: true, isActive: true, isDeleted: true },
      });

      if (!variant) {
        throw new NotFoundException(`Variant with ID ${variantId} not found`);
      }

      if (!variant.isActive) {
        throw new BadRequestException('This variant is not active');
      }

      if (variant.isDeleted) {
        throw new BadRequestException('This variant has been deleted');
      }

      // Stock is already decremented when reservation is created,
      // so available = current stock
      const availableStock = variant.stock;

      if (quantity > availableStock) {
        throw new ConflictException(
          `Only ${availableStock} items available. You requested ${quantity}.`,
        );
      }

      // Atomic update: only decrement if stock is sufficient
      // This prevents race conditions by ensuring the update only succeeds
      // when stock is still available
      const updatedVariant = await tx.productVariant.updateMany({
        where: {
          id: variantId,
          stock: { gte: quantity }, // Only update if stock >= quantity
        },
        data: { stock: { decrement: quantity } },
      });

      // Check if update was successful (count === 1 means it worked)
      if (updatedVariant.count === 0) {
        // Stock was modified by another request, fetch current state
        const currentVariant = await tx.productVariant.findUnique({
          where: { id: variantId },
          select: { stock: true },
        });
        throw new ConflictException(
          `Unable to reserve stock. Current available: ${currentVariant?.stock || 0}. Please try again.`,
        );
      }

      // Get updated stock for response
      const finalVariant = await tx.productVariant.findUnique({
        where: { id: variantId },
        select: { stock: true },
      });

      // Create the reservation
      const reservation = await tx.stockReservation.create({
        data: {
          userId: effectiveUserId,
          variantId,
          quantity,
          status: 'ACTIVE',
          expiresAt,
        },
        include: {
          variant: {
            select: {
              id: true,
              sku: true,
              price: true,
            },
          },
        },
      });

      return { reservation, availableStock: finalVariant?.stock || 0 };
    });

    return {
      message: 'Stock reserved successfully',
      status: 'success',
      data: {
        reservationId: result.reservation.id,
        variantId: result.reservation.variantId,
        quantity: result.reservation.quantity,
        expiresAt: result.reservation.expiresAt,
        availableStock: result.availableStock,
      },
    };
  }

  /**
   * Release a reservation (when user removes from cart or manually releases)
   * Restores the stock back to the variant
   * For guest users, provide guestPhone to find the guest user
   * Public API - no authentication required
   */
  async releaseReservation(
    reservationId: number,
    userId: number | null,
    guestPhone?: string,
  ) {
    // For guest users, find the guest user account
    let effectiveUserId = userId;
    if (!userId && guestPhone) {
      const guestUser = await this.guestUserService.findByPhone(guestPhone);
      if (!guestUser) {
        throw new NotFoundException(
          'Guest user not found. Please provide a valid phone number.',
        );
      }
      effectiveUserId = guestUser.id;
    }

    // Allow releasing by reservationId alone for anonymous users
    // If no userId and no guestPhone, we'll try to find by reservationId only

    // Use transaction to ensure atomicity
    const result = await this.prisma.$transaction(async (tx) => {
      // Build the query based on whether we have a userId or not
      const query: any = {
        id: reservationId,
        status: 'ACTIVE' as const,
      };

      // Only add userId filter if we have a valid userId (not null and not -1 for anonymous)
      if (effectiveUserId && effectiveUserId > 0) {
        query.userId = effectiveUserId;
      }

      const reservation = await tx.stockReservation.findFirst({
        where: query,
      });

      if (!reservation) {
        throw new NotFoundException(
          'Reservation not found or already released/expired',
        );
      }

      // Restore stock back to the variant
      await tx.productVariant.update({
        where: { id: reservation.variantId },
        data: { stock: { increment: reservation.quantity } },
      });

      // Update reservation status to RELEASED
      await tx.stockReservation.update({
        where: { id: reservationId },
        data: {
          status: 'RELEASED',
          updatedAt: new Date(),
        },
      });

      return { reservationId: reservation.id, quantity: reservation.quantity };
    });

    return {
      message: 'Reservation released successfully',
      status: 'success',
      data: {
        reservationId: result.reservationId,
        restoredStock: result.quantity,
      },
    };
  }

  /**
   * Mark a reservation as used (when order is successfully placed)
   * Note: Stock was already decremented when reservation was created,
   * so we only update the reservation status here
   */
  async markReservationAsUsed(reservationId: number, orderId: number) {
    const reservation = await this.prisma.stockReservation.findUnique({
      where: { id: reservationId },
    });

    if (!reservation || reservation.status !== 'ACTIVE') {
      throw new BadRequestException('Reservation not found or not active');
    }

    // Verify expiration
    if (new Date() > reservation.expiresAt) {
      // Stock was already decremented, need to restore it since reservation expired
      await this.prisma.$transaction(async (tx) => {
        await tx.stockReservation.update({
          where: { id: reservationId },
          data: {
            status: 'EXPIRED',
            orderId,
            updatedAt: new Date(),
          },
        });

        // Restore the stock since the reservation expired before being used
        await tx.productVariant.update({
          where: { id: reservation.variantId },
          data: { stock: { increment: reservation.quantity } },
        });
      });

      throw new BadRequestException(
        'Reservation has expired - stock has been restored',
      );
    }

    // Update reservation status to USED (stock already decremented in reserveStock)
    await this.prisma.stockReservation.update({
      where: { id: reservationId },
      data: {
        status: 'USED',
        orderId,
        updatedAt: new Date(),
      },
    });

    return {
      message: 'Reservation used successfully',
      status: 'success',
      data: { reservationId, orderId },
    };
  }

  /**
   * Get active reservations for a user or guest
   * For guest users, provide guestPhone to find the guest user
   */
  async getUserReservations(userId: number | null, guestPhone?: string) {
    // For guest users, find the guest user account
    let effectiveUserId = userId;
    if (!userId && guestPhone) {
      const guestUser = await this.guestUserService.findByPhone(guestPhone);
      if (guestUser) {
        effectiveUserId = guestUser.id;
      }
    }

    if (!effectiveUserId) {
      return {
        message: 'No active reservations',
        status: 'success',
        data: [],
      };
    }

    const reservations = await this.prisma.stockReservation.findMany({
      where: {
        userId: effectiveUserId,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
      include: {
        variant: {
          select: {
            id: true,
            sku: true,
            price: true,
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      message: 'Active reservations retrieved',
      status: 'success',
      data: reservations,
    };
  }

  /**
   * Get available stock for a variant (considering active reservations)
   */
  async getAvailableStock(variantId: number) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { stock: true },
    });

    if (!variant) {
      throw new NotFoundException(`Variant not found`);
    }

    const activeReservations = await this.prisma.stockReservation.aggregate({
      where: {
        variantId,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
      _sum: { quantity: true },
    });

    const reservedQuantity = activeReservations._sum.quantity || 0;
    // Stock is already decremented when reservation is created,
    // so available = current stock (not stock - reservedQuantity)
    const availableStock = variant.stock;

    return {
      message: 'Available stock retrieved',
      status: 'success',
      data: {
        variantId,
        totalStock: variant.stock,
        reservedStock: reservedQuantity,
        availableStock: Math.max(0, availableStock),
      },
    };
  }

  /**
   * Batch get available stock for multiple variants (optimized for N+1 queries)
   * Returns stock info for all variants in ONE query
   */
  async getAvailableStockBulk(variantIds: number[]) {
    if (variantIds.length === 0) {
      return [];
    }

    // Get all variants in one query
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, stock: true },
    });

    // Get all active reservations for these variants in one query
    const reservations = await this.prisma.stockReservation.groupBy({
      by: ['variantId'],
      where: {
        variantId: { in: variantIds },
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
      _sum: {
        quantity: true,
      },
    });

    // Create a map for quick lookup
    const reservationMap = new Map<number, number>();
    reservations.forEach((r) => {
      reservationMap.set(r.variantId, r._sum.quantity || 0);
    });

    // Build result for each variant
    const variantMap = new Map(variants.map((v) => [v.id, v]));

    return variantIds
      .map((id) => {
        const variant = variantMap.get(id);
        if (!variant) return null;

        // Stock is already decremented at reservation time
        // variant.stock represents available stock (source of truth)
        // activeReservationQuantity is for reporting Purposes Only
        const activeReservationQuantity = reservationMap.get(id) || 0;
        const availableStock = variant.stock;

        return {
          variantId: id,
          totalStock: variant.stock,
          activeReservationQuantity: activeReservationQuantity, // For reporting only - NOT used in availability math
          availableStock: Math.max(0, availableStock),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }

  /**
   * Check if stock is available for a given quantity
   */
  async checkAvailability(variantId: number, quantity: number) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { stock: true, isActive: true },
    });

    if (!variant) {
      throw new NotFoundException(`Variant not found`);
    }

    if (!variant.isActive) {
      return {
        available: false,
        message: 'Variant is not active',
        availableStock: 0,
      };
    }

    // Stock is already decremented when reservation is created,
    // so available = current stock
    const availableStock = variant.stock;

    return {
      available: quantity <= availableStock,
      message:
        quantity <= availableStock
          ? 'Stock available'
          : `Only ${availableStock} items available`,
      availableStock,
    };
  }

  /**
   * Release all expired reservations (for cron job or manual trigger)
   * Restores stock back to variants for all expired reservations
   */
  async releaseExpiredReservations() {
    // First, get all expired reservations to restore their stock
    const expiredReservations = await this.prisma.stockReservation.findMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { lte: new Date() },
      },
      select: { id: true, variantId: true, quantity: true },
    });

    if (expiredReservations.length === 0) {
      return {
        message: 'No expired reservations to release',
        status: 'success',
        data: { count: 0 },
      };
    }

    // Track how many were actually processed
    let restoredCount = 0;
    const skippedReservations: number[] = [];

    // Use transaction to restore stock and update status
    await this.prisma.$transaction(async (tx) => {
      // Restore stock for each expired reservation
      for (const reservation of expiredReservations) {
        // FIX #1: Check variant exists AND is not deleted before restoring stock
        const variant = await tx.productVariant.findUnique({
          where: { id: reservation.variantId },
          select: { id: true, isDeleted: true },
        });

        // Only restore if variant exists and wasn't permanently deleted
        if (variant && !variant.isDeleted) {
          await tx.productVariant.update({
            where: { id: reservation.variantId },
            data: { stock: { increment: reservation.quantity } },
          });
          restoredCount++;
        } else {
          // Log for admin review (variant was deleted before reservation expired)
          // eslint-disable-next-line no-console
          console.warn(
            `[StockReservation] Skipped stock restore for deleted variant ${reservation.variantId}, reservation ${reservation.id}`,
          );
          skippedReservations.push(reservation.id);
        }
      }

      // Update all expired reservations to EXPIRED status (only those we processed)
      // We only mark as EXPIRED the ones we successfully handled
      if (skippedReservations.length > 0) {
        // Mark processed ones as EXPIRED, keep skipped ones as ACTIVE for manual review
        const processedIds = expiredReservations
          .filter((r) => !skippedReservations.includes(r.id))
          .map((r) => r.id);

        if (processedIds.length > 0) {
          await tx.stockReservation.updateMany({
            where: { id: { in: processedIds } },
            data: { status: 'EXPIRED', updatedAt: new Date() },
          });
        }
      } else {
        // All processed successfully - update all
        await tx.stockReservation.updateMany({
          where: {
            status: 'ACTIVE',
            expiresAt: { lte: new Date() },
          },
          data: {
            status: 'EXPIRED',
            updatedAt: new Date(),
          },
        });
      }
    });

    return {
      message: `Released ${expiredReservations.length} expired reservations and restored stock`,
      status: 'success',
      data: {
        totalFound: expiredReservations.length,
        restored: restoredCount,
        skipped: skippedReservations.length,
        skippedReservationIds: skippedReservations,
      },
    };
  }

  /**
   * Get reservation by ID
   */
  async getReservationById(reservationId: number) {
    const reservation = await this.prisma.stockReservation.findUnique({
      where: { id: reservationId },
      include: {
        variant: {
          select: {
            id: true,
            sku: true,
            price: true,
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
    });

    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }

    return {
      message: 'Reservation retrieved',
      status: 'success',
      data: reservation,
    };
  }

  /**
   * Force clean ALL active reservations regardless of expiration
   * Admin endpoint for emergency cleanup - restores all stock
   * WARNING: This will release ALL active reservations
   */
  async forceCleanAllReservations() {
    // Get all active reservations
    const activeReservations = await this.prisma.stockReservation.findMany({
      where: {
        status: 'ACTIVE',
      },
      select: { id: true, variantId: true, quantity: true, userId: true },
    });

    if (activeReservations.length === 0) {
      return {
        message: 'No active reservations to clean',
        status: 'success',
        data: { count: 0 },
      };
    }

    // Track how many were actually processed
    let restoredCount = 0;
    const skippedReservations: number[] = [];

    // Use transaction to restore stock and update status
    await this.prisma.$transaction(async (tx) => {
      // Restore stock for each active reservation
      for (const reservation of activeReservations) {
        // FIX #2: Check variant exists AND is not deleted before restoring stock
        const variant = await tx.productVariant.findUnique({
          where: { id: reservation.variantId },
          select: { id: true, isDeleted: true },
        });

        // Only restore if variant exists and wasn't permanently deleted
        if (variant && !variant.isDeleted) {
          await tx.productVariant.update({
            where: { id: reservation.variantId },
            data: { stock: { increment: reservation.quantity } },
          });
          restoredCount++;
        } else {
          // Log for admin review
          // eslint-disable-next-line no-console
          console.warn(
            `[StockReservation] Force clean skipped for deleted variant ${reservation.variantId}, reservation ${reservation.id}`,
          );
          skippedReservations.push(reservation.id);
        }
      }

      // Update all active reservations to EXPIRED status (only those we processed successfully)
      if (skippedReservations.length > 0) {
        const processedIds = activeReservations
          .filter((r) => !skippedReservations.includes(r.id))
          .map((r) => r.id);

        if (processedIds.length > 0) {
          await tx.stockReservation.updateMany({
            where: { id: { in: processedIds } },
            data: { status: 'EXPIRED', updatedAt: new Date() },
          });
        }
      } else {
        // All processed successfully - update all
        await tx.stockReservation.updateMany({
          where: { status: 'ACTIVE' },
          data: { status: 'EXPIRED', updatedAt: new Date() },
        });
      }
    });

    return {
      message: `Force cleaned ${activeReservations.length} active reservations and restored stock`,
      status: 'success',
      data: {
        totalFound: activeReservations.length,
        restored: restoredCount,
        skipped: skippedReservations.length,
        skippedReservationIds: skippedReservations,
      },
    };
  }
}
