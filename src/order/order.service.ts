import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { Order, OrderStatus, Role } from '@prisma/client';

@Injectable()
export class OrderService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new order
   * Security: Only authenticated users can create orders
   */
  async create(
    userId: number,
    dto: CreateOrderDto,
  ): Promise<{
    message: string;
    status: string;
    data: Order;
  }> {
    // Validate all variants exist and have sufficient stock
    const variantIds = dto.items.map((item) => item.variantId);
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: { product: true },
    });

    if (variants.length !== variantIds.length) {
      throw new NotFoundException('One or more product variants not found');
    }

    // Check stock availability for each item
    for (const item of dto.items) {
      const variant = variants.find((v) => v.id === item.variantId);
      if (!variant) continue;

      if (variant.stock < item.quantity) {
        throw new BadRequestException(
          `Insufficient stock for variant ${variant.sku}. Available: ${variant.stock}, Requested: ${item.quantity}`,
        );
      }
    }

    // Calculate total and create order items
    let total = 0;
    const orderItemsData = dto.items.map((item) => {
      const variant = variants.find((v) => v.id === item.variantId)!;
      const itemTotal = Number(variant.price) * item.quantity;
      total += itemTotal;

      return {
        variantId: item.variantId,
        quantity: item.quantity,
        price: variant.price,
      };
    });

    // Create order in a transaction to ensure data consistency
    const order = await this.prisma.$transaction(async (tx) => {
      // Deduct stock for each item
      for (const item of dto.items) {
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: {
            stock: {
              decrement: item.quantity,
            },
          },
        });
      }

      // Create the order
      return tx.order.create({
        data: {
          userId,
          paymentMethod: dto.paymentMethod || 'CASH_ON_DELIVERY',
          total,
          items: {
            create: orderItemsData,
          },
        },
        include: {
          items: {
            include: {
              variant: {
                include: {
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
          user: {
            select: {
              id: true,
              email: true,
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
   * Get all orders (admin) or user's own orders (customer)
   * Security: Customers can only see their own orders, admins see all
   */
  async findAll(
    userId: number,
    userRole: Role,
  ): Promise<{
    message: string;
    status: string;
    data: Order[];
  }> {
    let orders: Order[];

    if (userRole === Role.ADMIN) {
      // Admin can see all orders
      orders = await this.prisma.order.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });
    } else {
      // Customers can only see their own orders
      orders = await this.prisma.order.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });
    }

    return {
      message:
        orders.length > 0 ? 'Orders retrieved successfully' : 'No orders found',
      status: 'success',
      data: orders,
    };
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
    data: Order;
  }> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
        items: {
          include: {
            variant: {
              include: {
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

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Security: Check if user owns this order or is admin
    if (userRole !== Role.ADMIN && order.userId !== userId) {
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

    // If order is cancelled, restore stock
    if (dto.status === OrderStatus.CANCELLED) {
      await this.prisma.$transaction(async (tx) => {
        const orderItems = await tx.orderItem.findMany({
          where: { orderId: id },
        });

        for (const item of orderItems) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: {
              stock: {
                increment: item.quantity,
              },
            },
          });
        }
      });
    }

    return {
      message: 'Order status updated successfully',
      status: 'success',
      data: updatedOrder,
    };
  }
}
