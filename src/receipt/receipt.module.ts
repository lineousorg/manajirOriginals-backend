import { Module } from '@nestjs/common';
import { ReceiptService } from './receipt.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ReceiptService],
  exports: [ReceiptService],
})
export class ReceiptModule {}