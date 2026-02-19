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
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { Order, OrderStatus, Role } from '@prisma/client';
import PDFDocument from 'pdfkit';

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

  /**
   * Generate a PDF receipt for an order
   * Security: Customers can only generate receipts for their own orders
   */
  async generateReceipt(
    id: number,
    userId: number,
    userRole: Role,
  ): Promise<Buffer> {
    // Fetch order with all details
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        user: true,
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

    // Fetch user's default address for shipping info
    const defaultAddress = await this.prisma.address.findFirst({
      where: {
        userId: order.userId,
        isDefault: true,
      },
    });

    // Generate PDF
    const pdfBuffer: Buffer = await new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(24).text('RECEIPT', { align: 'center' });
      doc.moveDown();

      // Company Info
      doc.fontSize(12).text('Manajir Originals', { align: 'center' });
      doc.text('E-commerce Store', { align: 'center' });
      doc.moveDown();

      // Order Details
      doc.fontSize(12);
      doc.text(`Order ID: #${order.id}`);
      doc.text(`Date: ${order.createdAt.toLocaleDateString()}`);
      doc.text(`Status: ${order.status}`);
      doc.text(`Payment Method: ${order.paymentMethod || 'N/A'}`);
      doc.moveDown();

      // Customer Info
      doc.fontSize(14).text('Customer Details', { underline: true });
      doc.fontSize(12);
      doc.text(`Email: ${order.user.email}`);
      if (defaultAddress) {
        doc.text(`Name: ${defaultAddress.firstName} ${defaultAddress.lastName}`);
        doc.text(`Phone: ${defaultAddress.phone}`);
      }
      doc.moveDown();

      // Shipping Address
      if (defaultAddress) {
        doc.fontSize(14).text('Shipping Address', { underline: true });
        doc.fontSize(12);
        doc.text(`${defaultAddress.address}`);
        if (defaultAddress.city || defaultAddress.postalCode) {
          doc.text(`${defaultAddress.city || ''} ${defaultAddress.postalCode || ''}`.trim());
        }
        if (defaultAddress.country) {
          doc.text(`${defaultAddress.country}`);
        }
        doc.moveDown();
      }

      // Items Table Header
      doc.fontSize(14).text('Order Items', { underline: true });
      doc.moveDown(0.5);

      const tableTop = doc.y;
      doc.fontSize(10);
      doc.text('Item', 50, tableTop);
      doc.text('Qty', 200, tableTop);
      doc.text('Price', 250, tableTop);
      doc.text('Total', 320, tableTop);
      
      // Draw line under header
      doc.moveTo(50, tableTop + 15)
        .lineTo(400, tableTop + 15)
        .stroke();

      let position = tableTop + 25;

      // Items
      for (const item of order.items) {
        const itemName = item.variant.product.name;
        const variantName = item.variant.sku ? ` (SKU: ${item.variant.sku})` : '';
        const itemTotal = Number(item.price) * item.quantity;

        doc.text(`${itemName}${variantName}`, 50, position, { width: 140 });
        doc.text(item.quantity.toString(), 200, position);
        doc.text(`${Number(item.price).toFixed(2)}`, 250, position);
        doc.text(`${itemTotal.toFixed(2)}`, 320, position);

        position += 20;
      }

      // Draw line before total
      doc.moveTo(50, position + 5)
        .lineTo(400, position + 5)
        .stroke();

      position += 20;

      // Total
      doc.fontSize(12);
      doc.text('Total:', 250, position);
      doc.text(`${Number(order.total).toFixed(2)}`, 320, position, { bold: true });

      // Footer
      doc.fontSize(10);
      doc.text('Thank you for your purchase!', 50, 700, { align: 'center' });

      doc.end();
    });

    return pdfBuffer;
  }
}
