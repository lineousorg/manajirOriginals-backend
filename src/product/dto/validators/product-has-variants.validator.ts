import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'productHasVariants', async: false })
export class ProductHasVariantsValidator implements ValidatorConstraintInterface {
  validate(variants: any[]) {
    if (!Array.isArray(variants)) return false;
    return variants.length > 0;
  }

  defaultMessage() {
    return 'Product must have at least one variant';
  }
}

export { ProductHasVariantsValidator as ProductHasVariants };
