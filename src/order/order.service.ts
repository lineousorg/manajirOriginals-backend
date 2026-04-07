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
import { Order, OrderStatus, Role, DeliveryType } from '@prisma/client';
import PDFDocument from 'pdfkit';
import {
  PaginationQueryDto,
  PaginatedResponse,
  createPaginatedResponse,
} from '../common/dto/pagination.dto';

/**
 * Generate order number: yyyymmddproductid
 * Example: 202604071234 (April 7, 2026, product ID 1234)
 */
function generateOrderNumber(productId: number): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}${month}${day}${productId}`;
}

/**
 * Generate invoice number: INV-productIdDDMMYY
 * Example: INV-1234070426 (Invoice for product 1234, date 07/04/26)
 */
function generateInvoiceNumber(productId: number): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String(now.getFullYear()).slice(-2);
  return `INV-${productId}${day}${month}${year}`;
}

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
    // Only check stock for items WITHOUT reservation (reserved items already have stock decremented)
    for (const item of dto.items) {
      // Skip stock check if item has a reservation - stock is already decremented
      if (item.reservationId) {
        continue;
      }
      
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
        reservationId: item.reservationId || null, // Track reservation if used
      };
    });

    // Calculate delivery charge based on delivery type
    const deliveryType = dto.deliveryType || DeliveryType.INSIDE_DHAKA;
    const deliveryCharge =
      deliveryType === DeliveryType.INSIDE_DHAKA ? 70 : 150;

    // Add delivery charge to total
    total += deliveryCharge;

    // Get primary product ID for order/invoice number generation
    // Use the first product in the order
    const primaryProductId = variants[0]?.product?.id || 1;

    // Generate order and invoice numbers (with fallback if duplicates exist)
    let orderNumber = generateOrderNumber(primaryProductId);
    let invoiceNumber = generateInvoiceNumber(primaryProductId);

    // Check for duplicates and regenerate if necessary
    const existingOrder = await this.prisma.order.findFirst({
      where: { OR: [{ orderNumber }, { invoiceNumber }] },
    });

    if (existingOrder) {
      // If duplicate, append sequential suffix based on existing orders count
      const count = await this.prisma.order.count({
        where: {
          orderNumber: { startsWith: orderNumber },
        },
      });
      orderNumber = `${orderNumber}-${count + 1}`;
      invoiceNumber = `${invoiceNumber}-${count + 1}`;
    }

    // Create order in a transaction to ensure data consistency
    const order = await this.prisma.$transaction(async (tx) => {
      // Separate items with reservations from those without
      const itemsWithReservation = dto.items.filter(item => item.reservationId);
      const itemsWithoutReservation = dto.items.filter(item => !item.reservationId);

      // For items WITH reservation: stock already decremented, just validate the reservation
      for (const item of itemsWithReservation) {
        const reservation = await tx.stockReservation.findUnique({
          where: { id: item.reservationId },
        });

        if (!reservation || reservation.status !== 'ACTIVE') {
          throw new BadRequestException(
            `Reservation ${item.reservationId} is not valid or already used`,
          );
        }

        if (reservation.variantId !== item.variantId) {
          throw new BadRequestException(
            `Reservation ${item.reservationId} does not match variant ${item.variantId}`,
          );
        }

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

      // For items WITHOUT reservation: decrement stock (legacy behavior)
      if (itemsWithoutReservation.length > 0) {
        const stockUpdates = itemsWithoutReservation.map((item) => ({
          id: item.variantId,
          decrement: item.quantity,
        }));

        // Execute all stock updates in parallel
        await Promise.all(
          stockUpdates.map((update) =>
            tx.productVariant.update({
              where: { id: update.id },
              data: { stock: { decrement: update.decrement } },
            }),
          ),
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

    // If order is cancelled, restore stock using bulk update
    if (dto.status === OrderStatus.CANCELLED) {
      await this.prisma.$transaction(async (tx) => {
        const orderItems = await tx.orderItem.findMany({
          where: { orderId: id },
          select: { variantId: true, quantity: true },
        });

        // Bulk restore stock for all items
        await Promise.all(
          orderItems.map((item) =>
            tx.productVariant.update({
              where: { id: item.variantId },
              data: { stock: { increment: item.quantity } },
            }),
          ),
        );
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
    // Fetch order with all details including address
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
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
        address: true,
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
    if (userRole !== Role.ADMIN && order.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to view this order',
      );
    }

    // Generate PDF
    const pdfBuffer: Buffer = await new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Colors
      const primaryColor = '#1a365d';
      const secondaryColor = '#4a5568';

      // Header Background
      doc.rect(0, 0, 595, 120).fill(primaryColor);

      // Company Name
      doc.fillColor('#ffffff').fontSize(28).font('Helvetica-Bold');
      doc.text('MANAJIR ORIGINALS', 50, 40, { align: 'center' });
      doc.fontSize(12).font('Helvetica');
      doc.text('www.manajiroriginals.com', 50, 85, { align: 'center' });

      // Receipt Title
      doc.fontSize(14).font('Helvetica-Bold');
      doc.text('RECEIPT', 50, 105, { align: 'center' });

      // Reset position for content
      doc.fillColor('#000000');
      let yPos = 140;

      // Order Information Card
      doc.rect(40, yPos, 515, 80).fillAndStroke('#f7fafc', '#e2e8f0');
      yPos += 15;

      doc.fontSize(11).font('Helvetica-Bold');
      doc.fillColor(primaryColor).text('ORDER INFORMATION', 55, yPos);
      yPos += 20;

      doc.fontSize(10).font('Helvetica');
      doc.fillColor(secondaryColor);

      // First column
      doc.text(`Order Number:`, 55, yPos);
      doc.text(`Invoice Number:`, 55, yPos + 15);
      doc.text(`Order Date:`, 55, yPos + 30);
      doc.text(`Order Status:`, 55, yPos + 45);

      // Second column
      doc.text(`Payment Method:`, 250, yPos);
      // doc.text(`Payment Status:`, 250, yPos + 15);
      doc.text(`Delivery Type:`, 250, yPos + 30);

      // Values (in black)
      doc.fillColor('#000000');
      doc.text(order.orderNumber || `ORD-${order.id.toString().padStart(6, '0')}`, 150, yPos);
      doc.text(order.invoiceNumber || `INV-${order.id.toString().padStart(6, '0')}`, 150, yPos + 15);
      doc.text(
        order.createdAt.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        130,
        yPos + 30,
      );
      doc.fillColor('#38a169').text(order.status, 130, yPos + 45);

      doc.text(order.paymentMethod.replace(/_/g, ' '), 340, yPos);
      
      // Payment status based on order status
      const paymentStatus = order.status === 'PAID' || order.status === 'DELIVERED' ? 'PAID' : 'PENDING';
      doc.fillColor(paymentStatus === 'PAID' ? '#38a169' : '#e53e3e').text(paymentStatus, 340, yPos + 15);

      // Delivery type display
      const deliveryTypeText = order.deliveryType
        ? order.deliveryType === 'INSIDE_DHAKA'
          ? 'Inside Dhaka'
          : 'Outside Dhaka'
        : 'Inside Dhaka';
      doc.fillColor(primaryColor).text(deliveryTypeText, 340, yPos + 30);

      yPos += 100;

      // Customer & Shipping Section
      const sectionWidth = 240;

      // Customer Details
      doc.rect(40, yPos, sectionWidth, 100).fillAndStroke('#f7fafc', '#e2e8f0');
      doc.fillColor(primaryColor).fontSize(11).font('Helvetica-Bold');
      doc.text('CUSTOMER DETAILS', 50, yPos + 10);

      doc.fontSize(10).font('Helvetica');
      doc.fillColor(secondaryColor);
      doc.text(`Email:`, 50, yPos + 28);
      doc.text(`Customer ID:`, 50, yPos + 43);

      doc.fillColor('#000000');
      doc.text(order.user.email, 110, yPos + 28);
      doc.text(`#${order.user.id}`, 120, yPos + 43);

      // Shipping Address
      const addressBoxX = 305;
      doc
        .rect(addressBoxX, yPos, sectionWidth, 100)
        .fillAndStroke('#f7fafc', '#e2e8f0');
      doc.fillColor(primaryColor).fontSize(11).font('Helvetica-Bold');
      doc.text('SHIPPING ADDRESS', addressBoxX + 10, yPos + 10);

      doc.fontSize(10).font('Helvetica');
      doc.fillColor(secondaryColor);

      if (order.address) {
        doc.fillColor('#000000').fontSize(10);
        doc.text(
          order.address.firstName + ' ' + order.address.lastName,
          addressBoxX + 10,
          yPos + 28,
        );
        doc.fillColor(secondaryColor);
        doc.text(`Phone:`, addressBoxX + 10, yPos + 43);
        doc.text(`Address:`, addressBoxX + 10, yPos + 58);

        doc.fillColor('#000000');
        doc.text(order.address.phone, addressBoxX + 55, yPos + 43);
        doc.text(order.address.address, addressBoxX + 10, yPos + 72, {
          width: 210,
        });

        const cityLine = [
          order.address.city,
          order.address.postalCode,
          order.address.country,
        ]
          .filter(Boolean)
          .filter(c => c && c.toLowerCase() !== 'usa' && c.toLowerCase() !== 'united states')
          .join(', ');
        if (cityLine) {
          doc.text(cityLine, addressBoxX + 10, yPos + 90);
        }
      } else {
        doc.fillColor('#000000');
        doc.text('No shipping address provided', addressBoxX + 10, yPos + 28);
      }

      yPos += 120;

      // Order Items Table
      doc.fontSize(12).font('Helvetica-Bold');
      doc.fillColor(primaryColor).text('ORDER ITEMS', 40, yPos);
      yPos += 10;

      // Table Header
      doc.rect(40, yPos, 515, 25).fill(primaryColor);
      doc.fillColor('#ffffff').fontSize(10);
      doc.text('#', 50, yPos + 7);
      doc.text('Item', 70, yPos + 7);
      doc.text('SKU', 220, yPos + 7);
      doc.text('Qty', 300, yPos + 7);
      doc.text('Price', 350, yPos + 7);
      doc.text('Total', 450, yPos + 7);

      yPos += 25;

      // Table Rows
      let itemIndex = 0;
      for (const item of order.items) {
        itemIndex++;
        const rowBg = itemIndex % 2 === 0 ? '#ffffff' : '#f7fafc';
        doc.rect(40, yPos, 515, 30).fill(rowBg);

        doc.fillColor(secondaryColor).fontSize(9);
        doc.text(itemIndex.toString(), 50, yPos + 10);

        // Item name with product and variant attributes
        const productName = item.variant.product.name;
        const attributes = item.variant.attributes
          .map(
            (attr) =>
              `${attr.attributeValue.attribute.name}: ${attr.attributeValue.value}`,
          )
          .join(', ');
        const itemDetails = attributes
          ? `${productName}\n${attributes}`
          : productName;

        doc.fillColor('#000000').fontSize(9);
        doc.text(itemDetails, 70, yPos + 5, { width: 140 });

        doc.fillColor(secondaryColor).fontSize(9);
        doc.text(item.variant.sku || '-', 220, yPos + 10);
        doc.text(item.quantity.toString(), 300, yPos + 10);
        doc.text(`${Number(item.price).toFixed(2)}`, 350, yPos + 10);
        doc.fillColor(primaryColor).fontSize(10);
        doc.text(
          `${(Number(item.price) * item.quantity).toFixed(2)}`,
          450,
          yPos + 10,
        );

        yPos += 30;
      }

      // Table Footer Line
      doc.moveTo(40, yPos).lineTo(555, yPos).stroke(secondaryColor);

      yPos += 10;

      // Subtotal, Shipping, Total
      const totalsX = 350;
      const valuesX = 450;

      // Calculate item subtotal (total - delivery charge)
      const deliveryCharge = Number(order.deliveryCharge) || 0;
      const itemSubtotal = Number(order.total) - deliveryCharge;

      doc.fontSize(10).font('Helvetica');
      doc.fillColor(secondaryColor);
      doc.text('Items Subtotal:', totalsX, yPos);
      doc.text(`${itemSubtotal.toFixed(2)}`, valuesX, yPos);

      yPos += 18;
      doc.text('Delivery Charge:', totalsX, yPos);
      doc.text(`${deliveryCharge.toFixed(2)}`, valuesX, yPos);

      yPos += 18;
      doc.rect(340, yPos - 5, 210, 30).fillAndStroke('#1a365d', '#1a365d');
      doc.fillColor('#ffffff').fontSize(12).font('Helvetica-Bold');
      doc.text('GRAND TOTAL:', totalsX + 5, yPos);
      doc.text(`${Number(order.total).toFixed(2)}`, valuesX, yPos);

      yPos += 50;

      // Footer
      doc.fontSize(9).font('Helvetica');
      doc.fillColor(secondaryColor);
      doc.text('Thank you for your purchase!', 297, yPos, { align: 'center' });
      yPos += 15;
      doc.text(
        'For any queries, please contact us at support@manajiroriginals.com',
        297,
        yPos,
        { align: 'center' },
      );
      yPos += 10;
      doc.text(
        'This is a computer-generated receipt and does not require a signature.',
        297,
        yPos,
        { align: 'center' },
      );

      // Footer line
      doc
        .moveTo(50, yPos + 10)
        .lineTo(545, yPos + 10)
        .stroke(secondaryColor);

      doc.end();
    });

    return pdfBuffer;
  }
}
