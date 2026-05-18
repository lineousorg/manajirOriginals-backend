import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

interface VariantWithAttributes {
  attributes?: Array<{ attributeId: number; valueId: number }>;
}

@ValidatorConstraint({ name: 'variantHasAttributes', async: false })
export class VariantHasAttributesValidator implements ValidatorConstraintInterface {
  validate(variant: VariantWithAttributes) {
    if (!variant || typeof variant !== 'object') return false;
    if (!variant.attributes || !Array.isArray(variant.attributes)) return false;
    return variant.attributes.length > 0;
  }

  defaultMessage() {
    return 'Each variant must have at least one attribute';
  }
}
