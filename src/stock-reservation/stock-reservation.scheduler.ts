/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StockReservationService } from './stock-reservation.service';

@Injectable()
export class StockReservationScheduler {
  private readonly logger = new Logger(StockReservationScheduler.name);

  constructor(
    private readonly stockReservationService: StockReservationService,
  ) {}

  /**
   * Run every 5 minutes to release expired reservations
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleExpiredReservations() {
    this.logger.log(
      'Running scheduled task: Release expired stock reservations',
    );

    try {
      const result =
        await this.stockReservationService.releaseExpiredReservations();

      if (result.data.count > 0) {
        this.logger.log(
          `Released ${result.data.count} expired stock reservations`,
        );
      } else {
        this.logger.debug('No expired reservations to release');
      }
    } catch (error) {
      this.logger.error('Failed to release expired reservations', error);
    }
  }
}
