import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

// Default reservation expiration time in minutes
export const DEFAULT_RESERVATION_MINUTES = 15;

@Injectable()
export class StockReservationService {
  constructor(private prisma: PrismaService) {}

  /**
   * Reserve stock for a user
   * Creates a reservation and checks if enough stock is available
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

    // Get the variant with current stock
    const variant = await this.prisma.productVariant.findUnique({
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

    if (quantity > availableStock) {
      throw new ConflictException(
        `Only ${availableStock} items available. You requested ${quantity}.`,
      );
    }

    // Calculate expiration time
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + expirationMinutes);

    // Create the reservation
    const reservation = await this.prisma.stockReservation.create({
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

    return {
      message: 'Stock reserved successfully',
      status: 'success',
      data: {
        reservationId: reservation.id,
        variantId: reservation.variantId,
        quantity: reservation.quantity,
        expiresAt: reservation.expiresAt,
        availableStock: availableStock - quantity,
      },
    };
  }

  /**
   * Release a reservation (when user removes from cart or manually releases)
   */
  async releaseReservation(reservationId: number, userId: number) {
    const reservation = await this.prisma.stockReservation.findFirst({
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

    await this.prisma.stockReservation.update({
      where: { id: reservationId },
      data: {
        status: 'RELEASED',
        updatedAt: new Date(),
      },
    });

    return {
      message: 'Reservation released successfully',
      status: 'success',
      data: { reservationId },
    };
  }

  /**
   * Mark a reservation as used (when order is successfully placed)
   */
  async markReservationAsUsed(reservationId: number, orderId: number) {
    const reservation = await this.prisma.stockReservation.findUnique({
      where: { id: reservationId },
    });

    if (!reservation || reservation.status !== 'ACTIVE') {
      throw new BadRequestException(
        'Reservation not found or not active',
      );
    }

    // Verify expiration
    if (new Date() > reservation.expiresAt) {
      throw new BadRequestException('Reservation has expired');
    }

    // Update reservation and create order in transaction
    await this.prisma.$transaction(async (tx) => {
      // Mark reservation as used
      await tx.stockReservation.update({
        where: { id: reservationId },
        data: {
          status: 'USED',
          orderId,
          updatedAt: new Date(),
        },
      });

      // Deduct stock from variant
      await tx.productVariant.update({
        where: { id: reservation.variantId },
        data: {
          stock: { decrement: reservation.quantity },
        },
      });
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
   */
  async releaseExpiredReservations() {
    const result = await this.prisma.stockReservation.updateMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { lte: new Date() },
      },
      data: {
        status: 'EXPIRED',
        updatedAt: new Date(),
      },
    });

    return {
      message: 'Expired reservations released',
      status: 'success',
      data: { count: result.count },
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
}