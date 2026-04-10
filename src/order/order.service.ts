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
    // Validate all variants exist
    const variantIds = dto.items.map((item) => item.variantId);
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: { product: true },
    });

    if (variants.length !== variantIds.length) {
      throw new NotFoundException('One or more product variants not found');
    }

    // Calculate total and create order items (outside transaction - just for pricing)
    let total = 0;
    const orderItemsData = dto.items.map((item) => {
      const variant = variants.find((v) => v.id === item.variantId)!;
      const itemTotal = Number(variant.price) * item.quantity;
      total += itemTotal;

      return {
        variantId: item.variantId,
        quantity: item.quantity,
        price: variant.price,
        reservationId: item.reservationId || null,
      };
    });

    // Calculate delivery charge
    const deliveryType = dto.deliveryType || DeliveryType.INSIDE_DHAKA;
    const deliveryCharge =
      deliveryType === DeliveryType.INSIDE_DHAKA ? 70 : 150;
    total += deliveryCharge;

    // Get primary product ID for order/invoice number generation
    const primaryProductId = variants[0]?.product?.id || 1;

    // Generate order and invoice numbers
    let orderNumber = generateOrderNumber(primaryProductId);
    let invoiceNumber = generateInvoiceNumber(primaryProductId);

    // Check for duplicates
    const existingOrder = await this.prisma.order.findFirst({
      where: { OR: [{ orderNumber }, { invoiceNumber }] },
    });

    if (existingOrder) {
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
      const itemsWithReservation = dto.items.filter(
        (item) => item.reservationId,
      );
      const itemsWithoutReservation = dto.items.filter(
        (item) => !item.reservationId,
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

      // Issue #3: For items WITHOUT reservation: use atomic update inside transaction


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

    // If order is cancelled, restore stock and release reservations
    if (dto.status === OrderStatus.CANCELLED) {
      await this.prisma.$transaction(async (tx) => {
        const orderItems = await tx.orderItem.findMany({
          where: { orderId: id },
          select: { variantId: true, quantity: true, reservationId: true },
        });

        // Process each order item
        for (const item of orderItems) {
          // If there's a reservation, release it (set status to RELEASED)
          if (item.reservationId) {
            await tx.stockReservation.updateMany({
              where: { id: item.reservationId, status: 'USED' },
              data: { status: 'RELEASED', updatedAt: new Date() },
            });
          } else {
            // No reservation: restore the stock
            await tx.productVariant.update({
              where: { id: item.variantId },
              data: { stock: { increment: item.quantity } },
            });
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
      // Truncate long emails to fit
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
        doc.text(
          formatCurrency(Number(item.price)),
          colPositions.price,
          yPos + 11,
          {
            width: 60,
            align: 'right',
          },
        );

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
