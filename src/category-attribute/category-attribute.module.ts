import { Module } from '@nestjs/common';
import { CategoryAttributeController } from './category-attribute.controller';
import { CategoryAttributeService } from './category-attribute.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CategoryAttributeController],
  providers: [CategoryAttributeService],
  exports: [CategoryAttributeService],
})
export class CategoryAttributeModule {}
