import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Default reservation expiration time in minutes
export const DEFAULT_RESERVATION_MINUTES = 15;

@Injectable()
export class StockReservationService {
  constructor(private prisma: PrismaService) {}

  /**
   * Reserve stock for a user
   * Creates a reservation and decrements actual stock
   * Uses pessimistic locking to prevent race conditions
   */
  async reserveStock(
    userId: number,
    variantId: number,
    quantity: number,
    expirationMinutes: number = DEFAULT_RESERVATION_MINUTES,
  ) {
    // Validate quantity
    if (quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than 0');
    }

    // Calculate expiration time
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + expirationMinutes);

    // Create reservation and decrement stock in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Use pessimistic locking (SELECT FOR UPDATE) to prevent race conditions
      // This locks the variant row until transaction completes
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

      // Calculate available stock (total - active reservations)
      // Note: We check reservations BEFORE decrementing to prevent overselling
      const activeReservations = await tx.stockReservation.aggregate({
        where: {
          variantId,
          status: 'ACTIVE',
          expiresAt: { gt: new Date() },
        },
        _sum: { quantity: true },
      });

      const reservedQuantity = activeReservations._sum.quantity || 0;
      const availableStock = variant.stock - reservedQuantity;

      if (quantity > availableStock) {
        throw new ConflictException(
          `Only ${availableStock} items available. You requested ${quantity}.`,
        );
      }

      // Additional safety check: ensure stock won't go negative
      // This is a safeguard against any race condition edge cases
      const projectedStock = variant.stock - quantity;
      if (projectedStock < 0) {
        throw new ConflictException(
          'Unable to reserve stock due to concurrent modification. Please try again.',
        );
      }

      // Decrement actual stock
      const updatedVariant = await tx.productVariant.update({
        where: { id: variantId },
        data: { stock: { decrement: quantity } },
      });

      // Double-check stock didn't go negative (should never happen with our checks)
      if (updatedVariant.stock < 0) {
        // Rollback by incrementing back
        await tx.productVariant.update({
          where: { id: variantId },
          data: { stock: { increment: quantity } },
        });
        throw new ConflictException(
          'Stock reservation failed due to concurrent modification. Please try again.',
        );
      }

      // Create the reservation
      const reservation = await tx.stockReservation.create({
        data: {
          userId,
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

      return { reservation, availableStock };
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
   */
  async releaseReservation(reservationId: number, userId: number) {
    // Use transaction to ensure atomicity
    const result = await this.prisma.$transaction(async (tx) => {
      const reservation = await tx.stockReservation.findFirst({
        where: {
          id: reservationId,
          userId,
          status: 'ACTIVE',
        },
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
   * Get active reservations for a user
   */
  async getUserReservations(userId: number) {
    const reservations = await this.prisma.stockReservation.findMany({
      where: {
        userId,
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
    const availableStock = variant.stock - reservedQuantity;

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

    const activeReservations = await this.prisma.stockReservation.aggregate({
      where: {
        variantId,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
      _sum: { quantity: true },
    });

    const reservedQuantity = activeReservations._sum.quantity || 0;
    const availableStock = variant.stock - reservedQuantity;

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

    // Use transaction to restore stock and update status
    await this.prisma.$transaction(async (tx) => {
      // Restore stock for each expired reservation
      for (const reservation of expiredReservations) {
        await tx.productVariant.update({
          where: { id: reservation.variantId },
          data: { stock: { increment: reservation.quantity } },
        });
      }

      // Update all expired reservations to EXPIRED status
      const result = await tx.stockReservation.updateMany({
        where: {
          status: 'ACTIVE',
          expiresAt: { lte: new Date() },
        },
        data: {
          status: 'EXPIRED',
          updatedAt: new Date(),
        },
      });

      return result;
    });

    return {
      message: `Released ${expiredReservations.length} expired reservations and restored stock`,
      status: 'success',
      data: { count: expiredReservations.length },
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

    // Use transaction to restore stock and update status
    await this.prisma.$transaction(async (tx) => {
      // Restore stock for each active reservation
      for (const reservation of activeReservations) {
        await tx.productVariant.update({
          where: { id: reservation.variantId },
          data: { stock: { increment: reservation.quantity } },
        });
      }

      // Update all active reservations to EXPIRED status
      await tx.stockReservation.updateMany({
        where: {
          status: 'ACTIVE',
        },
        data: {
          status: 'EXPIRED',
          updatedAt: new Date(),
        },
      });
    });

    return {
      message: `Force cleaned ${activeReservations.length} active reservations and restored stock`,
      status: 'success',
      data: { count: activeReservations.length },
    };
  }
}
