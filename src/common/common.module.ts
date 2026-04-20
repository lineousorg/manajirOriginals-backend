import { Module } from '@nestjs/common';
import { PricingService } from './services/pricing.service';
import { VariantValidationService } from './services/variant-validation.service';

@Module({
  providers: [PricingService, VariantValidationService],
  exports: [PricingService, VariantValidationService],
})
export class CommonModule {}
