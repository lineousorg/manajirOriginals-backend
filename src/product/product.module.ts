import { Module } from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { StockReservationModule } from '../stock-reservation/stock-reservation.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [StockReservationModule, CommonModule],
  providers: [ProductService, PrismaService],
  controllers: [ProductController],
  exports: [ProductService],
})
export class ProductModule {}
