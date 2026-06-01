/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

/**
 * Custom validator to ensure discountEnd date is after discountStart date
 * when both are provided
 */
export function IsDiscountDateValid(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isDiscountDateValid',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(_value: any, args: ValidationArguments) {
          const obj = args.object as any;
          const discountStart = obj.discountStart;
          const discountEnd = obj.discountEnd;

          // If both dates are provided, ensure end is after start
          if (discountStart && discountEnd) {
            const startDate = new Date(discountStart);
            const endDate = new Date(discountEnd);

            // Check if dates are valid
            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
              return false;
            }

            // End date must be strictly after start date
            return endDate > startDate;
          }

          return true;
        },
        defaultMessage() {
          return 'Discount end date must be after discount start date';
        },
      },
    });
  };
}

/**
 * Custom validator to ensure FIXED discount value does not exceed price
 */
export function IsFixedDiscountValid(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isFixedDiscountValid',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(_value: any, args: ValidationArguments) {
          const obj = args.object as any;
          const discountType = obj.discountType;
          const discountValue = obj.discountValue;
          const price = obj.price;

          // Only validate for FIXED discount type when all values are present
          if (
            discountType === 'FIXED' &&
            discountValue !== null &&
            discountValue !== undefined &&
            price !== null &&
            price !== undefined
          ) {
            // FIXED discount value must not exceed price
            return Number(discountValue) <= Number(price);
          }

          return true;
        },
        defaultMessage() {
          return 'Fixed discount value cannot exceed the variant price';
        },
      },
    });
  };
}
