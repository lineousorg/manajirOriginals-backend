/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { MailerService } from './mailer.service';
import { MailerProcessor } from './mailer.processor';
import { ReceiptModule } from '../receipt/receipt.module';

/**
 * MailerModule - Email notification module with Bull queue
 * Production-ready: Configured with Redis, retry logic, and error handling
 */
@Module({
  imports: [
    // Import ConfigModule for environment variables
    ConfigModule,
    // Register Bull queue for order emails
    BullModule.registerQueue({
      name: 'order-emails',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: false,
        removeOnFail: false,
      },
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    }),
    // Import ReceiptModule for PDF generation
    ReceiptModule,
  ],
  providers: [MailerService, MailerProcessor],
  exports: [MailerService],
})
export class MailerModule {}
