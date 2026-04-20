/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateGuestOrderDto } from './dto/create-guest-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { Order, OrderStatus, Role, DeliveryType } from '@prisma/client';
import PDFDocument from 'pdfkit';
import axios from 'axios';
import {
  PaginationQueryDto,
  PaginatedResponse,
  createPaginatedResponse,
} from '../common/dto/pagination.dto';
import { GuestUserService } from '../guest-user/guest-user.service';
import { PricingService } from '../common/services/pricing.service';
import { randomUUID } from 'crypto';

/**
 * Generate unique order number using UUID
 * Format: ORD-XXXXXXXX (8 char prefix to keep it readable)
 * Uses crypto.randomUUID() for collision-resistant unique IDs
 */
function generateOrderNumber(_productId: number): string {
  // Use UUID v4 - cryptographically unique
  return `ORD-${randomUUID().slice(0, 8).toUpperCase()}`;
}

/**
 * Generate unique invoice number using UUID
 * Format: INV-XXXXXXXX (8 char prefix)
 * Uses crypto.randomUUID() for collision-resistant unique IDs
 */
function generateInvoiceNumber(_productId: number): string {
  // Use UUID v4 - cryptographically unique
  return `INV-${randomUUID().slice(0, 8).toUpperCase()}`;
}

/**
 * Get delivery charge from config
 */
function getDeliveryCharge(config: ConfigService, deliveryType: DeliveryType): number {
  return deliveryType === DeliveryType.INSIDE_DHAKA
    ? Number(config.get('DELIVERY_CHARGE_INSIDE_DHAKA') || 120)
    : Number(config.get('DELIVERY_CHARGE_OUTSIDE_DHAKA') || 200);
}

@Injectable()
export class OrderService {
  constructor(
    private prisma: PrismaService,
    private guestUserService: GuestUserService,
    private config: ConfigService,
    private pricingService: PricingService,
  ) {}

  /**
   * Validate reCAPTCHA token with Google
   */
  private async validateRecaptcha(token: string): Promise<boolean> {
    if (!token) {
      return true; // Skip validation if no token
    }

    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    if (!secretKey) {
      console.warn('RECAPTCHA_SECRET_KEY not configured, skipping validation');
      return true;
    }

    try {
      const response = await axios.post(
        'https://www.google.com/recaptcha/api/siteverify',
        null,
        {
          params: {
            secret: secretKey,
            response: token,
          },
        },
      );

      if (!response.data.success) {
        throw new BadRequestException('reCAPTCHA validation failed');
      }

      return true;
    } catch (error: any) {
      console.error('reCAPTCHA validation error:', error.message);
      throw new BadRequestException('reCAPTCHA validation error');
    }
  }

  /**
   * Create a new order
   * Security: Only authenticated users can create orders
   * All stock checks and reservation validations happen inside transaction
   */
  async create(
    userId: number,
    dto: CreateOrderDto,
  ): Promise<{
    message: string;
    status: string;
    data: Order;
  }> {
    // Validate all variants exist and are active/not deleted
    const variantIds = dto.items.map((item) => item.variantId);
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: { product: true },
    });

    if (variants.length !== variantIds.length) {
      throw new NotFoundException('One or more product variants not found');
    }

    // FIX #7a: Validate variants are not deleted and are active
    const invalidVariants = variants.filter(
      (v) => v.isDeleted || !v.isActive,
    );
    if (invalidVariants.length > 0) {
      const invalidIds = invalidVariants.map((v) => v.id).join(', ');
      throw new BadRequestException(
        `Cannot order from deleted or inactive variants: ${invalidIds}`,
      );
    }

    // Calculate total and create order items (outside transaction - just for pricing)
    // Using shared PricingService for consistency
    let total = 0;
    const orderItemsData = dto.items.map((item) => {
      const variant = variants.find((v) => v.id === item.variantId)!;

      // Use shared PricingService for discount calculation
      const pricing = this.pricingService.calculateOrderItemPricing(
        variant,
        item.quantity,
        item.reservationId,
      );

      total += pricing.itemTotal;

      return {
        variantId: item.variantId,
        quantity: item.quantity,
        price: pricing.price,
        originalPrice: pricing.originalPrice,
        discountAmount: pricing.discountAmount,
        discountPercentage: pricing.discountPercentage,
        reservationId: item.reservationId || null,
      };
    });

    // Calculate delivery charge
    const deliveryType = dto.deliveryType || DeliveryType.INSIDE_DHAKA;
    const deliveryCharge = getDeliveryCharge(this.config, deliveryType);
    total += deliveryCharge;

    // Get primary product ID for order/invoice number generation
    const primaryProductId = variants[0]?.product?.id || 1;

    // Generate order and invoice numbers
    // Generate unique order/invoice numbers using UUID (collision-resistant)
    const orderNumber = generateOrderNumber(primaryProductId);
    const invoiceNumber = generateInvoiceNumber(primaryProductId);

    // Create order in a transaction to ensure data consistency
    const order = await this.prisma.$transaction(async (tx) => {
      // Separate items with reservations from those without
      const itemsWithReservation = dto.items.filter(
        (item) => item.reservationId,
      );

      // Issue #4 & #5: For items WITH reservation: validate ownership, expiration, and status
      for (const item of itemsWithReservation) {
        const reservation = await tx.stockReservation.findUnique({
          where: { id: item.reservationId },
        });

        // Validate reservation exists
        if (!reservation || reservation.status !== 'ACTIVE') {
          throw new BadRequestException(
            `Reservation ${item.reservationId} is not valid or already used`,
          );
        }

        // Issue #5: Validate reservation ownership
        // FIX #6: Removed debug console.log
        if (reservation.userId !== userId) {
          throw new BadRequestException(
            `Reservation ${item.reservationId} does not belong to this user`,
          );
        }

        // Issue #4: Validate reservation hasn't expired
        if (new Date() > reservation.expiresAt) {
          // Stock was already decremented, restore it
          await tx.productVariant.update({
            where: { id: reservation.variantId },
            data: { stock: { increment: reservation.quantity } },
          });
          throw new BadRequestException(
            `Reservation ${item.reservationId} has expired. Please reserve again.`,
          );
        }

        // Validate variant matches
        if (reservation.variantId !== item.variantId) {
          throw new BadRequestException(
            `Reservation ${item.reservationId} does not match variant ${item.variantId}`,
          );
        }

        // Validate quantity matches
        if (reservation.quantity !== item.quantity) {
          throw new BadRequestException(
            `Reservation quantity (${reservation.quantity}) does not match order quantity (${item.quantity})`,
          );
        }

        // Mark reservation as used
        await tx.stockReservation.update({
          where: { id: item.reservationId },
          data: {
            status: 'USED',
            updatedAt: new Date(),
          },
        });
      }

      // Issue #3: For items WITHOUT reservation: require reservation to prevent overselling
      const itemsWithoutReservation = dto.items.filter(
        (item) => !item.reservationId,
      );
      if (itemsWithoutReservation.length > 0) {
        const variantIds = itemsWithoutReservation
          .map((i) => i.variantId)
          .join(', ');
        throw new BadRequestException(
          `All items must have a valid reservation. Missing reservations for variants: ${variantIds}`,
        );
      }

      // Create the order
      return tx.order.create({
        data: {
          orderNumber,
          invoiceNumber,
          userId,
          paymentMethod: dto.paymentMethod || 'CASH_ON_DELIVERY',
          total,
          addressId: dto.addressId || null,
          deliveryType,
          deliveryCharge,
          items: {
            create: orderItemsData,
          },
        },
        select: {
          id: true,
          orderNumber: true,
          invoiceNumber: true,
          userId: true,
          guestUserId: true,
          addressId: true,
          status: true,
          paymentMethod: true,
          total: true,
          deliveryType: true,
          deliveryCharge: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              email: true,
            },
          },
          guestUser: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
              address: true,
              city: true,
              postalCode: true,
            },
          },
          address: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              address: true,
              city: true,
              postalCode: true,
              country: true,
              isDefault: true,
            },
          },
          items: {
            select: {
              id: true,
              quantity: true,
              price: true,
              variant: {
                select: {
                  id: true,
                  sku: true,
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
          },
        },
      });
    });

    return {
      message: 'Order created successfully',
      status: 'success',
      data: order,
    };
  }

  /**
   * Create a new order as guest (without authentication)
   * Security: No JWT required, anyone can create a guest order
   * Uses same logic as authenticated order but with guestUserId instead of userId
   */
  async createGuest(dto: CreateGuestOrderDto): Promise<{
    message: string;
    status: string;
    data: Order;
  }> {
    // Validate reCAPTCHA token if provided
    if (dto.recaptchaToken) {
      await this.validateRecaptcha(dto.recaptchaToken);
    }

    // Validate all variants exist and are active/not deleted
    const variantIds = dto.items.map((item) => item.variantId);
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: { product: true },
    });

    if (variants.length !== variantIds.length) {
      throw new NotFoundException('One or more product variants not found');
    }

    // FIX #7b: Validate variants are not deleted and are active
    const invalidVariants = variants.filter(
      (v) => v.isDeleted || !v.isActive,
    );
    if (invalidVariants.length > 0) {
      const invalidIds = invalidVariants.map((v) => v.id).join(', ');
      throw new BadRequestException(
        `Cannot order from deleted or inactive variants: ${invalidIds}`,
      );
    }

    // Calculate total and create order items (outside transaction - just for pricing)
    // Using shared PricingService for consistency
    let total = 0;
    const orderItemsData = dto.items.map((item) => {
      const variant = variants.find((v) => v.id === item.variantId)!;

      // Use shared PricingService for discount calculation
      const pricing = this.pricingService.calculateOrderItemPricing(
        variant,
        item.quantity,
        item.reservationId,
      );

      total += pricing.itemTotal;

      return {
        variantId: item.variantId,
        quantity: item.quantity,
        price: pricing.price,
        originalPrice: pricing.originalPrice,
        discountAmount: pricing.discountAmount,
        discountPercentage: pricing.discountPercentage,
        reservationId: item.reservationId || null,
      };
    });

    // Calculate delivery charge
    const deliveryType = dto.deliveryType || DeliveryType.INSIDE_DHAKA;
    const deliveryCharge = getDeliveryCharge(this.config, deliveryType);
    total += deliveryCharge;

    // Get primary product ID for order/invoice number generation
    const primaryProductId = variants[0]?.product?.id || 1;

    // Generate unique order/invoice numbers using UUID (collision-resistant)
    const orderNumber = generateOrderNumber(primaryProductId);
    const invoiceNumber = generateInvoiceNumber(primaryProductId);

    // Find or create guest user
    const guestUser = await this.guestUserService.findOrCreate({
      name: dto.name,
      phone: dto.phone,
      email: dto.email,
      address: dto.address,
      city: dto.city,
      postalCode: dto.postalCode,
    });

    // Create order in a transaction to ensure data consistency
    const order = await this.prisma.$transaction(async (tx) => {
      // For items without reservation: decrement stock using atomic update
      const itemsWithoutReservation = dto.items.filter(
        (item) => !item.reservationId,
      );

      // Use atomic conditional update to prevent race conditions
      // Only decrements if stock >= quantity (done by database)
      for (const item of itemsWithoutReservation) {
        const result = await tx.productVariant.updateMany({
          where: {
            id: item.variantId,
            stock: { gte: item.quantity }, // Atomic check: only update if sufficient stock
          },
          data: { stock: { decrement: item.quantity } },
        });

        // Check if update succeeded (count === 0 means stock was insufficient)
        if (result.count === 0) {
          const currentVariant = await tx.productVariant.findUnique({
            where: { id: item.variantId },
            select: { stock: true },
          });
          throw new BadRequestException(
            `Insufficient stock for variant ${item.variantId}. ` +
              `Available: ${currentVariant?.stock || 0}, Requested: ${item.quantity}`,
          );
        }
      }

      // Create the order
      return tx.order.create({
        data: {
          orderNumber,
          invoiceNumber,
          userId: null, // No authenticated user
          guestUserId: guestUser.id, // Link to guest user
          paymentMethod: dto.paymentMethod || 'CASH_ON_DELIVERY',
          total,
          addressId: null, // No saved address for guests
          deliveryType,
          deliveryCharge,
          items: {
            create: orderItemsData,
          },
        },
        select: {
          id: true,
          orderNumber: true,
          invoiceNumber: true,
          userId: true,
          guestUserId: true,
          addressId: true,
          status: true,
          paymentMethod: true,
          total: true,
          deliveryType: true,
          deliveryCharge: true,
          createdAt: true,
          updatedAt: true,
          guestUser: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
              address: true,
              city: true,
              postalCode: true,
            },
          },
          items: {
            select: {
              id: true,
              quantity: true,
              price: true,
              variant: {
                select: {
                  id: true,
                  sku: true,
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
          },
        },
      });
    });

    return {
      message: 'Order placed successfully',
      status: 'success',
      data: order,
    };
  }

  /**
   * Track guest orders by phone number
   * Security: No authentication required, anyone can track with phone number
   */
  async trackGuestOrder(phone: string): Promise<{
    message: string;
    status: string;
    data: any[];
  }> {
    const orders = await this.prisma.order.findMany({
      where: {
        guestUser: {
          phone: phone,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        orderNumber: true,
        invoiceNumber: true,
        status: true,
        paymentMethod: true,
        total: true,
        deliveryType: true,
        deliveryCharge: true,
        createdAt: true,
        guestUser: {
          select: {
            name: true,
            phone: true,
            email: true,
            address: true,
            city: true,
          },
        },
        items: {
          select: {
            id: true,
            quantity: true,
            price: true,
            variant: {
              select: {
                id: true,
                sku: true,
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
        },
      },
    });

    if (orders.length === 0) {
      return {
        message: 'No orders found for this phone number',
        status: 'success',
        data: [],
      };
    }

    return {
      message: 'Orders retrieved successfully',
      status: 'success',
      data: orders,
    };
  }

  /**
   * Get all orders (admin) or user's own orders (customer)
   * Security: Customers can only see their own orders, admins see all
   */
  async findAll(
    userId: number,
    userRole: Role,
    pagination: PaginationQueryDto,
  ): Promise<PaginatedResponse<any>> {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    if (userRole === Role.ADMIN) {
      // Admin can see all orders - with pagination
      const [orders, total] = await Promise.all([
        this.prisma.order.findMany({
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            orderNumber: true,
            invoiceNumber: true,
            addressId: true,
            status: true,
            paymentMethod: true,
            total: true,
            deliveryType: true,
            deliveryCharge: true,
            createdAt: true,
            updatedAt: true,
            user: {
              select: {
                id: true,
                email: true,
              },
            },
            _count: {
              select: { items: true },
            },
            guestUser: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                address: true,
                city: true,
                postalCode: true,
              },
            },
          },
        }),
        this.prisma.order.count(),
      ]);

      return createPaginatedResponse(
        orders,
        total,
        page,
        limit,
        orders.length > 0 ? 'Orders retrieved successfully' : 'No orders found',
      );
    } else {
      // Customers can only see their own orders - with pagination
      const [orders, total] = await Promise.all([
        this.prisma.order.findMany({
          where: { userId },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            orderNumber: true,
            invoiceNumber: true,
            addressId: true,
            status: true,
            paymentMethod: true,
            total: true,
            deliveryType: true,
            deliveryCharge: true,
            createdAt: true,
            updatedAt: true,
            user: {
              select: {
                id: true,
                email: true,
              },
            },
            address: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
                address: true,
                city: true,
                postalCode: true,
                country: true,
                isDefault: true,
              },
            },
            guestUser: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
              },
            },
            items: {
              select: {
                id: true,
                quantity: true,
                price: true,
                variant: {
                  select: {
                    id: true,
                    sku: true,
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
            },
          },
        }),
        this.prisma.order.count({ where: { userId } }),
      ]);

      return createPaginatedResponse(
        orders,
        total,
        page,
        limit,
        orders.length > 0 ? 'Orders retrieved successfully' : 'No orders found',
      );
    }
  }

  /**
   * Get a single order by ID
   * Security: Customers can only view their own orders
   */
  async findOne(
    id: number,
    userId: number,
    userRole: Role,
  ): Promise<{
    message: string;
    status: string;
    data: any;
  }> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        orderNumber: true,
        invoiceNumber: true,
        userId: true,
        guestUserId: true,
        addressId: true,
        status: true,
        paymentMethod: true,
        total: true,
        deliveryType: true,
        deliveryCharge: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            email: true,
          },
        },
        guestUser: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            address: true,
            city: true,
            postalCode: true,
          },
        },
        address: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            address: true,
            city: true,
            postalCode: true,
            country: true,
            isDefault: true,
          },
        },
        items: {
          where: {
            variant: {
              isDeleted: false,
            },
          },
          select: {
            id: true,
            quantity: true,
            price: true,
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
                attributes: {
                  select: {
                    attributeValue: {
                      select: {
                        id: true,
                        value: true,
                        attribute: {
                          select: {
                            id: true,
                            name: true,
                          },
                        },
                      },
                    },
                  },
                },
                images: {
                  select: {
                    id: true,
                    url: true,
                    altText: true,
                    position: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Security: Check if user owns this order or is admin
    // For guest orders, only admins can view
    if (
      userRole !== Role.ADMIN &&
      order.userId !== userId &&
      !order.guestUserId
    ) {
      throw new ForbiddenException(
        'You do not have permission to view this order',
      );
    }

    return {
      message: 'Order retrieved successfully',
      status: 'success',
      data: order,
    };
  }

  /**
   * Update order status
   * Security: Only admins can update order status
   */
  async updateStatus(
    id: number,
    dto: UpdateOrderStatusDto,
    userId: number,
    userRole: Role,
  ): Promise<{
    message: string;
    status: string;
    data: Order;
  }> {
    // Only admins can update order status
    if (userRole !== Role.ADMIN) {
      throw new ForbiddenException(
        'Only administrators can update order status',
      );
    }

    const order = await this.prisma.order.findUnique({
      where: { id },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Validate status transition (business logic)
    if (
      order.status === OrderStatus.DELIVERED &&
      dto.status !== OrderStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Cannot change status of a delivered order',
      );
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException(
        'Cannot change status of a cancelled order',
      );
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id },
      data: { status: dto.status },
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    // If order is cancelled, restore stock and release reservations
    if (dto.status === OrderStatus.CANCELLED) {
      await this.prisma.$transaction(async (tx) => {
        const orderItems = await tx.orderItem.findMany({
          where: { orderId: id },
          select: { variantId: true, quantity: true, reservationId: true },
        });

        // Process each order item
        for (const item of orderItems) {
          // FIX #3: Proper status validation before releasing reservation
          if (item.reservationId) {
            // First, get current reservation status
            const reservation = await tx.stockReservation.findUnique({
              where: { id: item.reservationId },
              select: { status: true, variantId: true, quantity: true },
            });

            if (reservation) {
              if (reservation.status === 'USED') {
                // OK: Reservation was used in order - release it
                await tx.stockReservation.update({
                  where: { id: item.reservationId },
                  data: { status: 'RELEASED', updatedAt: new Date() },
                });
              } else if (reservation.status === 'RELEASED' || reservation.status === 'EXPIRED') {
                // Already released/expired - no action needed, but log for debugging
                // eslint-disable-next-line no-console
                console.log(
                  `[OrderCancellation] Reservation ${item.reservationId} already ${reservation.status}, skipping`,
                );
              } else if (reservation.status === 'ACTIVE') {
                // This should not happen normally - but handle gracefully
                // Mark as RELEASED to maintain consistency
                // eslint-disable-next-line no-console
                console.warn(
                  `[OrderCancellation] Reservation ${item.reservationId} is ACTIVE during cancellation - marking as RELEASED`,
                );
                await tx.stockReservation.update({
                  where: { id: item.reservationId },
                  data: { status: 'RELEASED', updatedAt: new Date() },
                });
              }
            } else {
              // Reservation doesn't exist - shouldn't happen but handle gracefully
              // eslint-disable-next-line no-console
              console.warn(
                `[OrderCancellation] Reservation ${item.reservationId} not found for order ${id}`,
              );
            }
          } else {
            // No reservation: restore the stock (from guest order without reservation)
            // FIX: Check variant exists and is not deleted before restoring
            const variant = await tx.productVariant.findUnique({
              where: { id: item.variantId },
              select: { id: true, isDeleted: true },
            });

            if (variant && !variant.isDeleted) {
              await tx.productVariant.update({
                where: { id: item.variantId },
                data: { stock: { increment: item.quantity } },
              });
            } else {
              // eslint-disable-next-line no-console
              console.warn(
                `[OrderCancellation] Skipped stock restore for variant ${item.variantId} - variant deleted or not found`,
              );
            }
          }
        }
      });
    }

    return {
      message: 'Order status updated successfully',
      status: 'success',
      data: updatedOrder,
    };
  }

  /**
   * Generate a PDF receipt for an order
   * Security: Anyone can download if they own the order (authenticated) or have the phone (guest)
   */
  async generateReceipt(
    id: number,
    userId: number | undefined,
    userRole: Role | undefined,
    phone?: string,
  ): Promise<Buffer> {
    // Fetch order with all details including address
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        guestUserId: true,
        orderNumber: true,
        invoiceNumber: true,
        status: true,
        paymentMethod: true,
        total: true,
        deliveryType: true,
        deliveryCharge: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
          },
        },
        guestUser: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            address: true,
            city: true,
            postalCode: true,
            country: true,
          },
        },
        address: true,
        items: {
          select: {
            id: true,
            variantId: true,
            quantity: true,
            price: true,
            originalPrice: true,
            discountAmount: true,
            discountPercentage: true,
            variant: {
              include: {
                product: {
                  select: {
                    id: true,
                    name: true,
                    slug: true,
                  },
                },
                attributes: {
                  include: {
                    attributeValue: {
                      include: {
                        attribute: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Security: Check if user owns this order or is admin
    // For guest orders, allow if phone matches the guest user's phone
    const isAdmin = userRole === Role.ADMIN;
    const isOwner = order.userId === userId;
    // Only check guest ownership if phone is provided and not empty
    const phoneValue = phone && phone.trim() ? phone.trim() : undefined;
    const isGuestOwner =
      order.guestUserId && phoneValue
        ? await this.prisma.guestUser.findFirst({
            where: {
              id: order.guestUserId,
              phone: phoneValue,
            },
          })
        : false;

    if (!isAdmin && !isOwner && !isGuestOwner) {
      throw new ForbiddenException(
        'You do not have permission to view this order',
      );
    }

    // Generate PDF - Fixed Layout & Font Issues
    const pdfBuffer: Buffer = await new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Colors
      const primaryColor = '#621515';
      const secondaryColor = '#666666';
      const lightBg = '#f7fafc';
      const borderColor = '#e2e8f0';

      // Helper function for text with proper constraints
      const fitText = (
        text: string,
        x: number,
        y: number,
        width: number,
        options: any = {},
      ) => {
        const fontSize = options.size || 9;
        doc
          .fontSize(fontSize)
          .font(options.bold ? 'Helvetica-Bold' : 'Helvetica');
        doc.fillColor(options.color || '#000000');

        // Calculate if text fits, if not truncate
        const textWidth = doc.widthOfString(text);
        let displayText = text;
        if (textWidth > width && !options.noTruncate) {
          while (
            doc.widthOfString(displayText + '...') > width &&
            displayText.length > 3
          ) {
            displayText = displayText.slice(0, -1);
          }
          displayText += '...';
        }

        doc.text(displayText, x, y, {
          width: width,
          align: options.align || 'left',
          lineBreak: options.lineBreak !== false,
        });
      };

      // Currency formatter - uses "BDT" instead of symbol to avoid font issues
      const formatCurrency = (amount: number) =>
        `BDT ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      // Header Background
      doc.rect(0, 0, 595, 100).fill(primaryColor);

      // Company Name
      doc.fillColor('#ffffff').fontSize(24).font('Helvetica-Bold');
      doc.text('MANAJIR ORIGINALS', 0, 35, { align: 'center', width: 595 });

      doc.fontSize(10).font('Helvetica');
      doc.text('www.manajiroriginals.com', 0, 62, {
        align: 'center',
        width: 595,
      });

      doc.fontSize(11).font('Helvetica-Bold');
      doc.text('RECEIPT', 0, 78, { align: 'center', width: 595 });

      // Reset position for content
      let yPos = 115;

      // Order Information Card
      doc.rect(40, yPos, 515, 70).fillAndStroke(lightBg, borderColor);
      yPos += 10;

      fitText('ORDER INFORMATION', 50, yPos, 200, {
        size: 10,
        bold: true,
        color: primaryColor,
      });
      yPos += 16;

      // Two column layout with fixed positions
      const col1LabelX = 50;
      const col1ValueX = 130;
      const col2LabelX = 300;
      const col2ValueX = 390;
      const lineHeight = 14;
      const valueWidth = 150;

      // Column 1
      doc.fontSize(9).font('Helvetica');
      doc.fillColor(secondaryColor);
      doc.text('Order Number:', col1LabelX, yPos);
      doc.text('Invoice Number:', col1LabelX, yPos + lineHeight);
      doc.text('Order Date:', col1LabelX, yPos + lineHeight * 2);
      doc.text('Order Status:', col1LabelX, yPos + lineHeight * 3);

      doc.fillColor('#000000');
      fitText(
        order.orderNumber || `ORD-${order.id.toString().padStart(6, '0')}`,
        col1ValueX,
        yPos,
        valueWidth,
        { noTruncate: true },
      );
      fitText(
        order.invoiceNumber || `INV-${order.id.toString().padStart(6, '0')}`,
        col1ValueX,
        yPos + lineHeight,
        valueWidth,
        { noTruncate: true },
      );
      doc.text(
        order.createdAt.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        col1ValueX,
        yPos + lineHeight * 2,
      );

      const statusColor =
        order.status === 'PAID' || order.status === 'DELIVERED'
          ? '#38a169'
          : '#e53e3e';
      doc
        .fillColor(statusColor)
        .text(order.status, col1ValueX, yPos + lineHeight * 3);

      // Column 2
      doc.fillColor(secondaryColor);
      doc.text('Payment Method:', col2LabelX, yPos);
      doc.text('Payment Status:', col2LabelX, yPos + lineHeight);
      doc.text('Delivery Type:', col2LabelX, yPos + lineHeight * 2);

      doc.fillColor('#000000');
      fitText(
        order.paymentMethod.replace(/_/g, ' '),
        col2ValueX,
        yPos,
        valueWidth,
      );

      const paymentStatus =
        order.status === 'PAID' || order.status === 'DELIVERED'
          ? 'PAID'
          : 'PENDING';
      doc
        .fillColor(paymentStatus === 'PAID' ? '#38a169' : '#e53e3e')
        .text(paymentStatus, col2ValueX, yPos + lineHeight);

      const deliveryTypeText = order.deliveryType
        ? order.deliveryType === 'INSIDE_DHAKA'
          ? 'Inside Dhaka'
          : 'Outside Dhaka'
        : 'Inside Dhaka';
      doc
        .fillColor('#000000')
        .text(deliveryTypeText, col2ValueX, yPos + lineHeight * 2);

      yPos += 85;

      // Customer & Shipping Section - Side by Side
      const boxWidth = 247;
      const boxHeight = 85;

      // Customer Details Box
      doc
        .rect(40, yPos, boxWidth, boxHeight)
        .fillAndStroke(lightBg, borderColor);

      fitText('CUSTOMER DETAILS', 50, yPos + 8, 200, {
        size: 10,
        bold: true,
        color: primaryColor,
      });

      doc.fontSize(9).font('Helvetica');
      doc.fillColor(secondaryColor);
      doc.text('Email:', 50, yPos + 26);
      doc.text('Customer ID:', 50, yPos + 42);

      doc.fillColor('#000000');
      // Handle both authenticated users and guest users
      if (order.user) {
        const email = order.user.email;
        const emailWidth = doc.widthOfString(email);
        let displayEmail = email;
        if (emailWidth > 180) {
          while (
            doc.widthOfString(displayEmail + '...') > 180 &&
            displayEmail.length > 5
          ) {
            displayEmail = displayEmail.slice(0, -1);
          }
          if (displayEmail !== email) displayEmail += '...';
        }
        doc.text(displayEmail, 80, yPos + 26, { width: 200 });
        doc.text(`#${order.user.id}`, 105, yPos + 42);
      } else if (order.guestUser) {
        // Guest user - show their info
        const guestEmail = order.guestUser?.email || 'N/A';
        const guestName = order.guestUser?.name || 'Guest';
        doc.text(guestEmail, 80, yPos + 26, { width: 200 });
        doc.text(`Guest: ${guestName}`, 80, yPos + 42, { width: 200 });
      } else {
        doc.text('N/A', 80, yPos + 26);
        doc.text('N/A', 105, yPos + 42);
      }

      // Shipping Address Box
      const shipX = 308;
      doc
        .rect(shipX, yPos, boxWidth, boxHeight)
        .fillAndStroke(lightBg, borderColor);

      fitText('SHIPPING ADDRESS', shipX + 10, yPos + 8, 200, {
        size: 10,
        bold: true,
        color: primaryColor,
      });

      if (order.address) {
        doc.fontSize(9).font('Helvetica');
        doc.fillColor('#000000');

        const fullName = `${order.address.firstName} ${order.address.lastName}`;
        doc.text(fullName, shipX + 10, yPos + 24, { width: 220 });

        doc.fillColor(secondaryColor);
        doc.text('Phone:', shipX + 10, yPos + 38);
        doc.fillColor('#000000');
        doc.text(order.address.phone, shipX + 45, yPos + 38, { width: 190 });

        doc.fillColor(secondaryColor);
        doc.text('Address:', shipX + 10, yPos + 52);
        doc.fillColor('#000000');

        // Wrap address with line break
        const addressText = order.address.address;
        doc.text(addressText, shipX + 10, yPos + 66, {
          width: 220,
          height: 16,
          lineBreak: true,
        });

        const cityLine = [
          order.address.city,
          order.address.postalCode,
          order.address.country,
        ]
          .filter(Boolean)
          .filter(
            (c) =>
              c &&
              c.toLowerCase() !== 'usa' &&
              c.toLowerCase() !== 'united states',
          )
          .join(', ');

        if (cityLine) {
          doc.text(cityLine, shipX + 10, yPos + 76, { width: 220, height: 12 });
        }
      } else if (order.guestUser?.address) {
        // Guest user address fallback
        doc.fontSize(9).font('Helvetica');
        doc.fillColor('#000000');

        const guestName = order.guestUser?.name || 'Guest';
        doc.text(guestName, shipX + 10, yPos + 24, { width: 220 });

        doc.fillColor(secondaryColor);
        doc.text('Phone:', shipX + 10, yPos + 38);
        doc.fillColor('#000000');
        doc.text(order.guestUser?.phone || 'N/A', shipX + 45, yPos + 38, {
          width: 190,
        });

        doc.fillColor(secondaryColor);
        doc.text('Address:', shipX + 10, yPos + 52);
        doc.fillColor('#000000');

        const addressText = order.guestUser?.address || '';
        doc.text(addressText, shipX + 10, yPos + 66, {
          width: 220,
          height: 16,
          lineBreak: true,
        });

        const cityLine = [
          order.guestUser?.city,
          order.guestUser?.postalCode,
          order.guestUser?.country,
        ]
          .filter(Boolean)
          .filter(
            (c) =>
              c &&
              c.toLowerCase() !== 'usa' &&
              c.toLowerCase() !== 'united states',
          )
          .join(', ');

        if (cityLine) {
          doc.text(cityLine, shipX + 10, yPos + 76, { width: 220, height: 12 });
        }
      } else {
        doc.fillColor('#000000').fontSize(9);
        doc.text('No shipping address provided', shipX + 10, yPos + 30);
      }

      yPos += 100;

      // Order Items Section
      fitText('ORDER ITEMS', 40, yPos, 200, {
        size: 11,
        bold: true,
        color: primaryColor,
      });
      yPos += 15;

      // Table Header
      const tableX = 40;
      const tableWidth = 515;
      const rowHeight = 30;

      doc.rect(tableX, yPos, tableWidth, rowHeight).fill(primaryColor);
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');

      // Column positions with proper spacing
      const colPositions = {
        index: tableX + 10,
        item: tableX + 35,
        sku: tableX + 240,
        qty: tableX + 330,
        price: tableX + 380,
        total: tableX + 460,
      };

      doc.text('#', colPositions.index, yPos + 10);
      doc.text('Item', colPositions.item, yPos + 10);
      doc.text('SKU', colPositions.sku, yPos + 10);
      doc.text('Qty', colPositions.qty, yPos + 10, {
        width: 30,
        align: 'center',
      });
      doc.text('Price', colPositions.price, yPos + 10, {
        width: 60,
        align: 'right',
      });
      doc.text('Total', colPositions.total, yPos + 10, {
        width: 70,
        align: 'right',
      });

      yPos += rowHeight;

      // Table Rows
      let itemIndex = 0;
      for (const item of order.items) {
        itemIndex++;
        const rowBg = itemIndex % 2 === 0 ? '#ffffff' : lightBg;

        // Check if we need a new page
        if (yPos > 680) {
          doc.addPage();
          yPos = 50;
        }

        doc.rect(tableX, yPos, tableWidth, rowHeight).fill(rowBg);

        doc.fontSize(8).font('Helvetica');

        // Index
        doc.fillColor(secondaryColor);
        doc.text(itemIndex.toString(), colPositions.index, yPos + 11);

        // Item name with variant attributes - wrapped in fixed width
        const productName = item.variant.product.name;
        const attributes = item.variant.attributes
          .map((attr) => `${attr.attributeValue.value}`)
          .join(', ');

        doc.fillColor('#000000').font('Helvetica-Bold').fontSize(8);
        // Truncate product name if too long
        const nameWidth = doc.widthOfString(productName);
        let displayName = productName;
        if (nameWidth > 190) {
          while (
            doc.widthOfString(displayName + '...') > 190 &&
            displayName.length > 10
          ) {
            displayName = displayName.slice(0, -1);
          }
          if (displayName !== productName) displayName += '...';
        }
        doc.text(displayName, colPositions.item, yPos + 7, { width: 200 });

        if (attributes) {
          doc.font('Helvetica').fontSize(7).fillColor(secondaryColor);
          let attrText = attributes;
          if (doc.widthOfString(attrText) > 190) {
            while (
              doc.widthOfString(attrText + '...') > 190 &&
              attrText.length > 5
            ) {
              attrText = attrText.slice(0, -1);
            }
            attrText += '...';
          }
          doc.text(attrText, colPositions.item, yPos + 17, { width: 200 });
        }

        // SKU
        doc.fillColor(secondaryColor).fontSize(8).font('Helvetica');
        const skuText = item.variant.sku || '-';
        fitText(skuText, colPositions.sku, yPos + 11, 80);

        // Qty - centered
        doc.text(item.quantity.toString(), colPositions.qty, yPos + 11, {
          width: 30,
          align: 'center',
        });

        // Price - right aligned, using BDT instead of symbol
        // Show original price if discount exists
        let priceText = formatCurrency(Number(item.price));
        if (item.discountAmount && Number(item.discountAmount) > 0) {
          // Show original price struck through concept (but just show original)
          const originalPrice = item.originalPrice
            ? formatCurrency(Number(item.originalPrice))
            : formatCurrency(Number(item.price));
          priceText = `${originalPrice}`;
        }
        doc.text(priceText, colPositions.price, yPos + 11, {
          width: 60,
          align: 'right',
        });

        // Total - right aligned
        doc.fillColor(primaryColor).font('Helvetica-Bold');
        doc.text(
          formatCurrency(Number(item.price) * item.quantity),
          colPositions.total,
          yPos + 11,
          {
            width: 70,
            align: 'right',
          },
        );

        yPos += rowHeight;
      }

      // Table Footer Line
      doc
        .moveTo(tableX, yPos)
        .lineTo(tableX + tableWidth, yPos)
        .stroke(borderColor);
      yPos += 12;

      // Totals Section - Right aligned with proper spacing
      const totalsWidth = 220;
      const totalsX = tableX + tableWidth - totalsWidth;

      // Calculate values
      const deliveryCharge = Number(order.deliveryCharge) || 0;
      const itemSubtotal = Number(order.total) - deliveryCharge;

      // Calculate total discount from items
      let totalDiscount = 0;
      for (const item of order.items) {
        if (item.discountAmount) {
          totalDiscount += Number(item.discountAmount) * item.quantity;
        }
      }

      doc.fontSize(9).font('Helvetica');

      // Subtotal
      doc.fillColor(secondaryColor);
      doc.text('Items Subtotal:', totalsX, yPos, { width: 110, align: 'left' });
      doc.fillColor('#000000');
      doc.text(formatCurrency(itemSubtotal), totalsX + 110, yPos, {
        width: 110,
        align: 'right',
      });

      yPos += 16;

      // Discount (if any)
      if (totalDiscount > 0) {
        doc.fillColor('#16a34a'); // Green color for discount
        doc.text('Discount Saved:', totalsX, yPos, {
          width: 110,
          align: 'left',
        });
        doc.text(`-${formatCurrency(totalDiscount)}`, totalsX + 110, yPos, {
          width: 110,
          align: 'right',
        });
        yPos += 16;
      }

      // Delivery
      doc.fillColor(secondaryColor);
      doc.text('Delivery Charge:', totalsX, yPos, {
        width: 110,
        align: 'left',
      });
      doc.fillColor('#000000');
      doc.text(formatCurrency(deliveryCharge), totalsX + 110, yPos, {
        width: 110,
        align: 'right',
      });

      yPos += 20;

      // Grand Total Box
      doc
        .rect(totalsX - 10, yPos - 6, totalsWidth + 20, 28)
        .fillAndStroke(primaryColor, primaryColor);
      doc.fillColor('#ffffff').fontSize(11).font('Helvetica-Bold');
      doc.text('GRAND TOTAL:', totalsX, yPos, { width: 110, align: 'left' });
      doc.text(formatCurrency(Number(order.total)), totalsX + 110, yPos, {
        width: 110,
        align: 'right',
      });

      yPos += 45;

      // Footer
      doc.fontSize(8).font('Helvetica');
      doc.fillColor(secondaryColor);

      const footerLines = [
        'Thank you for your purchase!',
        'For any queries, please contact us at support@manajiroriginals.com',
        'This is a computer-generated receipt and does not require a signature.',
      ];

      footerLines.forEach((line, i) => {
        doc.text(line, 0, yPos + i * 12, { align: 'center', width: 595 });
      });

      // Footer line
      const footerY = yPos + 45;
      doc.moveTo(50, footerY).lineTo(545, footerY).stroke(borderColor);

      doc.end();
    });

    return pdfBuffer;
  }
}
