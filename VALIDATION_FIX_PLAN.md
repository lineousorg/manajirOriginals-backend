# Product Creation Validation — Fix Plan

## Context

### Business Rules
1. A **Product** cannot be created without at least **1 variant**.
2. A **Variant** cannot be created without at least **1 attribute value** (attribute + its value pair).

These rules are already enforced server-side in `product.service.ts` → `validateVariantAttributePayload()` (lines 37–108), but must also be enforced at the DTO/validation boundary so bad requests are rejected before reaching the service layer.

---

## Root Causes

### Problem A — Duplicate decorator blocks (silent metadata overwrite)
In both `create-product.dto.ts` and `update-product.dto.ts`, the `variants` property has two separate groups of decorators. In `class-validator` / `class-transformer`, decorators collapse into a single metadata entry per property; the second `@ValidateNested`/`@Type` block **overwrites** the first. This means `@ProductHasVariants` (the "at least 1 variant" gate) never actually fires — it is silently discarded.

### Problem B — `@VariantHasAttributes` rejects updates where attributes are omitted
In `UpdateProductVariantDto`, `attributes` is `@IsOptional()`. When a client updates only `price`/`stock` on an existing variant and omits `attributes`, the validator sees `undefined` and returns `false`. This makes every partial update fail — even though omitting `attributes` is by design.

### Problem C — Type hygiene drift
`VariantHasAttributesValidator` defines its own inline `interface VariantWithAttributes` with `Array<{ attributeId, valueId }>`, disconnected from the actual `VariantAttributeDto` class. If the class ever changes, the validator silently diverges.

---

## Scope

These changes affect **only** DTO validation for new incoming requests — nothing else.

---

## Changes

### File 1 — `src/product/dto/create-product.dto.ts`

Remove the trailing duplicate block. Keep a single coherent group.

**Before (lines 52–59):**
```ts
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantWithAttributesDto)
  @ProductHasVariants
  @ValidateNested({ each: true })    ← overwrites above
  @Type(() => VariantWithAttributesDto)
  @VariantHasAttributes({ each: true })
  variants!: VariantWithAttributesDto[];
```

**After:**
```ts
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantWithAttributesDto)
  @ProductHasVariants
  @VariantHasAttributes
  variants!: VariantWithAttributesDto[];
```

---

### File 2 — `src/product/dto/update-product.dto.ts`

Same duplicate-decorator fix.

**Before (lines 117–125):**
```ts
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateProductVariantDto)
  @ProductHasVariants({
    message: 'Product must have at least one variant when variants are provided',
  })
  @VariantHasAttributes({ each: true })
  variants?: UpdateProductVariantDto[];
```

**After:**
```ts
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateProductVariantDto)
  @ProductHasVariants
  @VariantHasAttributes
  variants?: UpdateProductVariantDto[];
```

---

### File 3 — `src/product/dto/validators/variant-has-attributes.validator.ts`

| Change | Reason |
|---|---|
| `!variant.attributes \|\| !Array.isArray(...)` now returns `true` (absent = pass) instead of `false` | Allows update requests to omit `attributes` (`@IsOptional()` on the DTO handles the guard). Create semantics are preserved because `VariantWithAttributesDto` has non-optional `attributes!` — a missing field fails `@IsNumber()` on `VariantAttributeDto.attributeId` before reaching this validator. |
| Import `VariantAttributeDto` and remove the inline `interface VariantWithAttributes` | Single source of truth for the attribute-value shape |

**After (full file):**
```ts
import { ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';
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
```

---

## Validation Flow After Fix

### Create — `CreateProductDto`
```
variants[] (@IsArray + @ProductHasVariants)
  └── @ValidateNested { each: true } → each item → VariantWithAttributesDto
        └── @VariantHasAttributes → attributes.length > 0 ── FAIL if missing/empty
```

### Update — `UpdateProductDto`
```
variants[] (@IsOptional + @IsArray + @ProductHasVariants)
  └── @ValidateNested { each: true } → each item → UpdateProductVariantDto
        └── @VariantHasAttributes → absent ∨ length > 0 ── PASS if omitted, FAIL if []
```

---

## Unchanged Files

| File | Why untouched |
|---|---|
| `src/product/product.service.ts` | Has its own `validateVariantAttributePayload()` guard; DTO layer is a pre-filter only |
| `src/product/product.controller.ts` | No validation logic here |
| `src/product/dto/create-product-with-attribute.dto.ts` | Structurally correct |
| `src/product/dto/variant-attribute.dto.ts` | No duplicate-decorator issues |

---

## Risk Assessment
- **Existing products:** Zero impact — DTO changes do not touch stored data or the service layer.
- `validateVariantAttributePayload()` in the service is untouched and remains as a secondary safety net.
- Update path for existing variants (`service.ts` line 738): service blocks `attributes` updates regardless — DTO changes do not override this.
