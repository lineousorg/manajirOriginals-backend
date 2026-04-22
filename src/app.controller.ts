import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { MailerService } from './mailer/mailer.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly mailerService: MailerService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  //Email testing dummy route
  @Get('test-email')
  async testEmail() {
    await this.mailerService.sendOrderConfirmationEmail({
      orderId: 1,
      orderNumber: 'TEST-001',
      customerEmail: 'rezarabbi9304@gmail.com',
      customerName: 'Test User',
      invoiceNumber: 'INV-001',
    });

    return {
      success: true,
      message:
        'Order confirmation email queued successfully. Check application logs for progress.',
    };
  }
}
