import { Module } from '@nestjs/common';
import { AttributeValueController } from './attribute-value.controller';
import { AttributeValueService } from './attribute-value.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AttributeValueController],
  providers: [AttributeValueService],
  exports: [AttributeValueService],
})
export class AttributeValueModule {}
