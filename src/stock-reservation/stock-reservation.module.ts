import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { StockReservationService } from './stock-reservation.service';
import { StockReservationController } from './stock-reservation.controller';
import { StockReservationScheduler } from './stock-reservation.scheduler';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, ScheduleModule],
  controllers: [StockReservationController],
  providers: [StockReservationService, StockReservationScheduler],
  exports: [StockReservationService],
})
export class StockReservationModule {}
