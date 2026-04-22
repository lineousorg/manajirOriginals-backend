import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import PDFDocument from 'pdfkit';

/**
 * ReceiptService - Generates PDF receipts for order confirmation emails
 * This service is extracted from OrderService to avoid circular dependencies
 * Production-ready: Robust error handling with meaningful error messages
 */
@Injectable()
export class ReceiptService {
  private readonly logger = new Logger(ReceiptService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a PDF receipt buffer for an order
   * Production-ready: Comprehensive error handling with logging
   * @param orderId - The order ID to generate receipt for
   * @returns Promise<Buffer> - PDF buffer
   * @throws NotFoundException if order not found
   * @throws InternalServerErrorException if PDF generation fails
   */
  async generatePDF(orderId: number): Promise<Buffer> {
    this.logger.log(`Generating PDF receipt for order ${orderId}`);

    try {
      // Fetch order with all details
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
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
        this.logger.error(`Order ${orderId} not found for receipt generation`);
        throw new Error(`Order with ID ${orderId} not found`);
      }

      // Generate PDF
      const pdfBuffer = await this.generatePDFContent(order);
      this.logger.log(`PDF receipt generated successfully for order ${orderId}`);

      return pdfBuffer;
    } catch (error) {
      this.logger.error(
        `Failed to generate PDF receipt for order ${orderId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Generate PDF content from order data
   * @param order - Order data with relations
   * @returns Promise<Buffer> - PDF buffer
   */
  private async generatePDFContent(order: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
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
          doc.fontSize(options.size || 9);
          doc.font(options.bold ? 'Helvetica-Bold' : 'Helvetica');
          doc.fillColor(options.color || '#000000');

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

        // Currency formatter
        const formatCurrency = (amount: number) =>
          `BDT ${amount.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`;

        // Header Background
        doc.rect(0, 0, 595, 100).fill(primaryColor);

        // Company Name
        doc.fillColor('#ffffff').fontSize(24).font('Helvetica-Bold');
        doc.text('MANAJIR ORIGINALS', 0, 35, {
          align: 'center',
          width: 595,
        });

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
          order.invoiceNumber ||
            `INV-${order.id.toString().padStart(6, '0')}`,
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
        doc.fillColor(statusColor).text(order.status, col1ValueX, yPos + lineHeight * 3);

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
          order.status === 'PAID' || order.status === 'DELIVERED' ? 'PAID' : 'PENDING';
        doc
          .fillColor(paymentStatus === 'PAID' ? '#38a169' : '#e53e3e')
          .text(paymentStatus, col2ValueX, yPos + lineHeight);

        const deliveryTypeText = order.deliveryType
          ? order.deliveryType === 'INSIDE_DHAKA'
            ? 'Inside Dhaka'
            : 'Outside Dhaka'
          : 'Inside Dhaka';
        doc.fillColor('#000000').text(deliveryTypeText, col2ValueX, yPos + lineHeight * 2);

        yPos += 85;

        // Customer & Shipping Section - Side by Side
        const boxWidth = 247;
        const boxHeight = 85;

        // Customer Details Box
        doc.rect(40, yPos, boxWidth, boxHeight).fillAndStroke(lightBg, borderColor);

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
        doc.rect(shipX, yPos, boxWidth, boxHeight).fillAndStroke(lightBg, borderColor);

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

          if (yPos > 680) {
            doc.addPage();
            yPos = 50;
          }

          doc.rect(tableX, yPos, tableWidth, rowHeight).fill(rowBg);

          doc.fontSize(8).font('Helvetica');

          // Index
          doc.fillColor(secondaryColor);
          doc.text(itemIndex.toString(), colPositions.index, yPos + 11);

          // Item name with variant attributes
          const productName = item.variant.product.name;
          const attributes = item.variant.attributes
            .map((attr: any) => `${attr.attributeValue.value}`)
            .join(', ');

          doc.fillColor('#000000').font('Helvetica-Bold').fontSize(8);
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

          // Qty
          doc.text(item.quantity.toString(), colPositions.qty, yPos + 11, {
            width: 30,
            align: 'center',
          });

          // Price
          let priceText = formatCurrency(Number(item.price));
          if (item.discountAmount && Number(item.discountAmount) > 0) {
            const originalPrice = item.originalPrice
              ? formatCurrency(Number(item.originalPrice))
              : formatCurrency(Number(item.price));
            priceText = `${originalPrice}`;
          }
          doc.text(priceText, colPositions.price, yPos + 11, {
            width: 60,
            align: 'right',
          });

          // Total
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
        doc.moveTo(tableX, yPos).lineTo(tableX + tableWidth, yPos).stroke(borderColor);
        yPos += 12;

        // Totals Section
        const totalsWidth = 220;
        const totalsX = tableX + tableWidth - totalsWidth;

        const deliveryCharge = Number(order.deliveryCharge) || 0;
        const itemSubtotal = Number(order.total) - deliveryCharge;

        let totalDiscount = 0;
        for (const item of order.items) {
          if (item.discountAmount) {
            totalDiscount += Number(item.discountAmount) * item.quantity;
          }
        }

        doc.fontSize(9).font('Helvetica');

        // Subtotal
        doc.fillColor(secondaryColor);
        doc.text('Items Subtotal:', totalsX, yPos, {
          width: 110,
          align: 'left',
        });
        doc.fillColor('#000000');
        doc.text(formatCurrency(itemSubtotal), totalsX + 110, yPos, {
          width: 110,
          align: 'right',
        });

        yPos += 16;

        // Discount
        if (totalDiscount > 0) {
          doc.fillColor('#16a34a');
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
      } catch (error) {
        reject(error);
      }
    });
  }
}