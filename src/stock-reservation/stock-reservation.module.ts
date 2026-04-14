import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { StockReservationService } from './stock-reservation.service';
import { StockReservationController } from './stock-reservation.controller';
import { StockReservationScheduler } from './stock-reservation.scheduler';
import { PrismaModule } from '../prisma/prisma.module';
import { GuestUserModule } from '../guest-user/guest-user.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, GuestUserModule, ScheduleModule, AuthModule],
  controllers: [StockReservationController],
  providers: [StockReservationService, StockReservationScheduler],
  exports: [StockReservationService],
})
export class StockReservationModule {}
