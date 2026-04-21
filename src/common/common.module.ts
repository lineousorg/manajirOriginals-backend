import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PricingService } from './services/pricing.service';
import { VariantValidationService } from './services/variant-validation.service';

@Module({
  imports: [PrismaModule],
  providers: [PricingService, VariantValidationService],
  exports: [PricingService, VariantValidationService],
})
export class CommonModule {}
