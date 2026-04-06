import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DiscountController } from './discount.controller';
import { DiscountService } from './discount.service';

@Module({
  controllers: [DiscountController],
  providers: [DiscountService, PrismaService],
  exports: [DiscountService],
})
export class DiscountModule {}
