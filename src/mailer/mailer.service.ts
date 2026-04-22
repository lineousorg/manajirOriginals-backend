/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

/**
 * Email job data interface
 */
export interface OrderEmailJobData {
  orderId: number;
  orderNumber: string;
  customerEmail: string;
  customerName: string;
  invoiceNumber: string;
}

/**
 * MailerService - Handles email queueing for order notifications
 * Production-ready: Robust error handling with meaningful error messages
 * Non-blocking: Email failures are logged but don't affect order creation
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  constructor(
    @InjectQueue('order-emails')
    private readonly emailQueue: Queue<OrderEmailJobData>,
  ) {}

  /**
   * Queue an order confirmation email to be sent
   * Production-ready: Validates input data, logs all operations
   * Non-blocking: Returns immediately, email is processed asynchronously
   * @param jobData - Order email job data
   * @throws InternalServerErrorException if queue operation fails
   */
  async sendOrderConfirmationEmail(jobData: OrderEmailJobData): Promise<void> {
    const { orderId, orderNumber, customerEmail } = jobData;

    // Validate required fields
    if (!orderId || !customerEmail) {
      this.logger.error(
        `Invalid email job data: missing required fields. Order: ${orderId}, Email: ${customerEmail}`,
      );
      throw new InternalServerErrorException(
        'Invalid email job data: order ID and customer email are required',
      );
    }

    // Validate email format (basic check)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customerEmail)) {
      this.logger.warn(
        `Invalid email format for order ${orderId}: ${customerEmail}. Skipping email.`,
      );
      return; // Skip invalid email, don't fail
    }

    try {
      // Add job to queue with retry configuration
      const job = await this.emailQueue.add(
        'send-order-confirmation',
        jobData,
        {
          attempts: 3, // Retry up to 3 times
          backoff: {
            type: 'exponential', // Exponential backoff
            delay: 1000, // Start with 1 second delay
          },
          removeOnComplete: false, // Keep completed jobs for debugging
          removeOnFail: false, // Keep failed jobs for manual review
        },
      );

      this.logger.log(
        `Order confirmation email queued successfully. Job ID: ${job.id}, Order: ${orderNumber}, Email: ${customerEmail}`,
      );
    } catch (error) {
      // Log error but don't throw - email is non-critical
      this.logger.error(
        `Failed to queue order confirmation email. Order: ${orderId}, Error: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      // Don't throw - order should still be created successfully
    }
  }

  /**
   * Get queue statistics for monitoring
   * @returns Promise with queue stats
   */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        this.emailQueue.getWaitingCount(),
        this.emailQueue.getActiveCount(),
        this.emailQueue.getCompletedCount(),
        this.emailQueue.getFailedCount(),
        this.emailQueue.getDelayedCount(),
      ]);

      return { waiting, active, completed, failed, delayed };
    } catch (error) {
      this.logger.error(
        `Failed to get queue stats: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new InternalServerErrorException(
        'Failed to retrieve queue statistics',
      );
    }
  }
}
