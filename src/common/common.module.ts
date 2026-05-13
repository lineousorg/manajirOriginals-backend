import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PricingService } from './services/pricing.service';
import { VariantValidationService } from './services/variant-validation.service';
import { CloudinaryService } from './services/cloudinary.service';

@Module({
  imports: [PrismaModule],
  providers: [PricingService, VariantValidationService, CloudinaryService],
  exports: [PricingService, VariantValidationService, CloudinaryService],
})
export class CommonModule {}
