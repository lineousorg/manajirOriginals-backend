import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { VariantAttributeDto } from '../create-product-with-attribute.dto';

@ValidatorConstraint({ name: 'variantHasAttributes', async: false })
export class VariantHasAttributesValidator implements ValidatorConstraintInterface {
  validate(variant: { attributes?: VariantAttributeDto[] }) {
    if (!variant || typeof variant !== 'object') return false;
    if (!variant.attributes || !Array.isArray(variant.attributes)) return true;
    return variant.attributes.length > 0;
  }

  defaultMessage() {
    return 'Each variant must have at least one attribute';
  }
}

export { VariantHasAttributesValidator as VariantHasAttributes };
