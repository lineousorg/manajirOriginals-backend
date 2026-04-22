/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Process, Processor, OnQueueFailed } from '@nestjs/bull';
import {
  Logger,
  InternalServerErrorException,
  OnModuleInit,
} from '@nestjs/common';
import { Job } from 'bull';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import { ReceiptService } from '../receipt/receipt.service';
import { OrderEmailJobData } from './mailer.service';

/**
 * MailerProcessor - Processes email jobs from the Bull queue
 * Production-ready: Comprehensive error handling, logging, and retry logic
 */
@Processor('order-emails')
export class MailerProcessor implements OnModuleInit {
  private readonly logger = new Logger(MailerProcessor.name);
  private transporter!: nodemailer.Transporter;
  private initialized = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly receiptService: ReceiptService,
  ) {}

  /**
   * Initialize the email transporter when module loads
   * Uses OnModuleInit to properly handle async initialization
   */
  async onModuleInit(): Promise<void> {
    await this.initializeTransporter();
  }

  /**
   * Initialize the email transporter
   * Production-ready: Logs initialization status and verifies SMTP connection
   */
  private async initializeTransporter(): Promise<void> {
    try {
      const host = this.configService.get<string>('MAILER_HOST');
      const port = this.configService.get<number>('MAILER_PORT') || 587;
      const secure = this.configService.get<string>('MAILER_SECURE') === 'true';
      const user = this.configService.get<string>('MAILER_USER');
      const password = this.configService.get<string>('MAILER_PASSWORD');
      const from =
        this.configService.get<string>('MAILER_FROM') || 'noreply@manajir.com';
      const fromName =
        this.configService.get<string>('MAILER_FROM_NAME') ||
        'Manajir Original';

      // Validate required config
      if (!host || !user || !password) {
        this.logger.error(
          'Missing required mailer configuration. Check MAILER_HOST, MAILER_USER, MAILER_PASSWORD',
        );
        return;
      }

      // Configure transporter with SMTP settings
      this.transporter = nodemailer.createTransport(
        {
          host,
          port,
          secure,
          auth: {
            user,
            pass: password,
          },
        },
        {
          from: `"${fromName}" <${from}>`,
        },
      );

      // Verify SMTP connection before marking as initialized
      await this.transporter.verify();
      this.logger.log('SMTP connection verified successfully');

      this.initialized = true;
      this.logger.log('Email transporter initialized successfully');
    } catch (error) {
      this.logger.error(
        `Failed to initialize email transporter: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Don't throw - allow app to start, email will fail gracefully
    }
  }

  /**
   * Generate HTML email content from template data
   */
  private generateOrderConfirmationHtml(data: {
    customerName: string;
    orderNumber: string;
    orderDate: string;
  }): string {
    const { customerName, orderNumber, orderDate } = data;
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Order Confirmation</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #621515; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 24px;">MANAJIR ORIGINALS</h1>
        <p style="margin: 5px 0 0 0; font-size: 14px;">www.manajiroriginals.com</p>
    </div>
    
    <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #e0e0e0; border-top: none;">
        <h2 style="color: #621515; margin-top: 0;">Thank you for your order!</h2>
        
        <p>Hi ${customerName},</p>
        
        <p>Your order has been placed successfully. We're processing your order and will notify you once it's shipped.</p>
        
        <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e0e0e0;">
            <p style="margin: 0 0 10px 0;"><strong>Order Number:</strong> ${orderNumber}</p>
            <p style="margin: 0;"><strong>Order Date:</strong> ${orderDate}</p>
        </div>
        
        <p>Please find your receipt attached to this email for your records.</p>
        
        <p>If you have any questions, feel free to contact us at <a href="mailto:support@manajiroriginals.com" style="color: #621515;">support@manajiroriginals.com</a></p>
        
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
        
        <p style="font-size: 12px; color: #666; text-align: center; margin: 0;">
            Thank you for shopping with Manajir Originals!<br>
            This is a computer-generated email. Please do not reply directly to this email.
        </p>
    </div>
</body>
</html>`;
  }

  /**
   * Process order confirmation email jobs
   * Production-ready: Comprehensive error handling, PDF attachment, and logging
   * @param job - Bull job containing order email data
   * @returns Promise<void>
   */
  @Process('send-order-confirmation')
  async handleOrderConfirmationEmail(
    job: Job<OrderEmailJobData>,
  ): Promise<void> {
    const { orderId, orderNumber, customerEmail, customerName } = job.data;

    this.logger.log(
      `Processing order confirmation email job. Job ID: ${job.id}, Order: ${orderNumber}`,
    );

    try {
      // Check if transporter is initialized
      if (!this.initialized) {
        throw new InternalServerErrorException(
          'Email transporter not initialized. Check MAILER_* environment variables.',
        );
      }

      // Generate PDF receipt
      this.logger.log(`Generating PDF receipt for order ${orderId}`);
      const pdfBuffer = await this.receiptService.generatePDF(orderId);

      // Prepare email data
      const orderDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      const mailOptions = {
        from: `"Manajir Original" <${this.configService.get<string>('MAILER_FROM') || 'noreply@manajir.com'}>`,
        to: customerEmail,
        subject: `Order Confirmed - ${orderNumber} | Manajir Original`,
        html: this.generateOrderConfirmationHtml({
          customerName: customerName || 'Valued Customer',
          orderNumber,
          orderDate,
        }),
        attachments: [
          {
            filename: `receipt-${orderNumber}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
      };

      // Send email
      this.logger.log(`Sending confirmation email to ${customerEmail}`);
      const info = await this.transporter.sendMail(mailOptions);

      this.logger.log(
        `Order confirmation email sent successfully. Message ID: ${info.messageId}, Order: ${orderNumber}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send order confirmation email. Job ID: ${job.id}, Order: ${orderId}, Error: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );

      // Re-throw to trigger Bull retry mechanism
      throw error;
    }
  }

  /**
   * Handle failed jobs - this is the correct Bull event handler
   * Called when a job fails after all retries are exhausted
   * @param job - Failed Bull job
   * @param err - Error that caused the failure
   */
  @OnQueueFailed()
  handleFailedJob(job: Job<OrderEmailJobData>, err: Error): void {
    this.logger.error(
      `Email job permanently failed after all retries. Order ID: ${job.data.orderId}, Order Number: ${job.data.orderNumber}, Email: ${job.data.customerEmail}, Error: ${err.message}`,
      err.stack,
    );
  }
}
