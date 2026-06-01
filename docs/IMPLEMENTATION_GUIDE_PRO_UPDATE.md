# Product Update API Implementation Guide (Complete)

## Endpoint Overview
- **Method**: PATCH
- **Route**: `/products/:id`
- **Description**: Update an existing product by ID with support for partial updates, variant management, and image handling
- **Authentication**: Requires JWT token with ADMIN role
- **Authorization**: `@Roles(Role.ADMIN)` guard applied

## Request Body Structure
The request body must conform to the `UpdateProductDto` TypeScript interface. All fields are optional unless otherwise specified.

### Top-Level Fields
| Field | Type | Description | Validation Rules |
|-------|------|-------------|------------------|
| `name` | string | Product name | Optional, no additional validation |
| `description` | string | Product description | Optional, no additional validation |
| `productDetailsHtml` | string | HTML content for product details | Optional, no additional validation |
| `isActive` | boolean | Product active status | Optional, defaults to existing value if not provided |
| `categoryId` | number | Category ID | Optional, must reference existing category |

### Variants Array (`variants?: UpdateProductVariantDto[]`)
Handles creation, updating, and soft deletion of product variants. Behavior depends on presence of `id` field:

#### Variant Object Fields
| Field | Type | Description | Validation Rules |
|-------|------|-------------|------------------|
| `id` | number | Existing variant ID | Optional. If present: updates existing variant. If absent: creates new variant or matches by SKU |
| `sku` | string | Stock Keeping Unit | Optional. Required for creating new variants or matching existing variants by SKU |
| `price` | number | Variant price | Optional. Required when creating new variant |
| `stock` | number | Inventory quantity | Optional, defaults to 0 when creating |
| `discountType` | enum | Discount type (`FIXED` or `PERCENTAGE`) | Optional, references `DiscountType` enum |
| `discountValue` | number | Discount value | Optional. For FIXED: must not exceed price (validated by `IsFixedDiscountValid`) |
| `discountStart` | string (ISO date) | Discount start date | Optional. Must be valid ISO date string |
| `discountEnd` | string (ISO date) | Discount end date | Optional. Must be valid ISO date string and after start date (validated by `IsDiscountDateValid`) |
| `attributes` | `VariantAttributeDto[]` | Array of attribute-value pairs | Optional. For creating new variants or updating existing variant attributes |

#### VariantAttributeDto
| Field | Type | Description | Validation Rules |
|-------|------|-------------|------------------|
| `attributeId` | number | Attribute ID | Required when attributes array is provided |
| `valueId` | number | Attribute value ID | Required when attributes array is provided |

#### Variant Behavior Rules
1. **Update Existing Variant**: When `id` is provided, updates the variant with that ID
2. **Create New Variant**: When `id` is absent but `sku` and `price` are provided:
   - If a variant with matching SKU exists under this product: updates that variant (by SKU match)
   - Otherwise: creates a new variant
3. **Soft Delete Variants**: Variants existing in the database but not present in the request array are soft-deleted (marked `isDeleted = true`)
4. **Attribute Handling**:
   - When updating variant attributes: existing attribute bindings are deleted and replaced with new ones
   - Attributes are validated against category rules (see Validation section below)
   - Combination key is regenerated when attributes change

#### Critical Implementation Notes
- **Empty Variants Array**: To delete ALL variants, you MUST trigger the transactional path by either:
  - Including at least one image in the request, OR
  - Including at least one variant in the array (even if you intend to delete it later)
  - Sending `variants: []` with no images will NOT delete any variants (takes simple update path)
- **SKU Updates by ID**: When updating a variant's SKU by providing `id` and new `sku`, there is NO uniqueness check - you could accidentally create duplicate SKUs within the same product. However, if you're ONLY updating fields like price, stock, or discount (without changing the SKU), there is no risk of SKU conflicts since the SKU remains unchanged. **Updating price, stock, or other non-SKU fields will never cause a SKU uniqueness conflict.**
- **SKU Match Updates**: When using SKU to match existing variants (no `id` provided), BOTH `sku` AND `price` must be provided for the match to work
- **Attribute Removal**: To remove all attributes from a variant, provide the variant `id` with an empty `attributes: []` array

### Images Array (`images?: UpdateProductImageDto[]`)
Handles creation, updating, and soft deletion of product images. Behavior depends on presence of `id` field:

#### Image Object Fields
| Field | Type | Description | Validation Rules |
|-------|------|-------------|------------------|
| `id` | number | Existing image ID | Optional. If present: updates existing image. If absent: creates new image |
| `url` | string | Image URL | Required |
| `publicId` | string | Cloudinary public ID | Optional |
| `altText` | string | Image alt text | Optional |
| `position` | number | Display position | Optional, defaults to array index when creating |

#### Image Behavior Rules
1. **Update Existing Image**: When `id` is provided, updates the image with that ID
2. **Create New Image**: When `id` is absent, creates a new image
3. **Soft Delete Images**: Images existing in the database but not present in the request array are soft-deleted (marked `isDeleted = true`)
4. **Position Handling**: When creating images without position, uses array index as position

## Validation Rules
### Class-Validator Decorators
- All fields use appropriate class-validator decorators (`IsOptional`, `IsString`, `IsNumber`, etc.)
- Nested objects use `ValidateNested` and `Type` for proper transformation
- Arrays use `IsArray` with `ValidateNested({ each: true })`

### Custom Validators
1. **IsDiscountDateValid**
   - Ensures `discountEnd` is strictly after `discountStart` when both are provided
   - Validates that both dates are valid ISO date strings
   - Error message: "Discount end date must be after discount start date"

2. **IsFixedDiscountValid**
   - Validates that for `FIXED` discount type, `discountValue` does not exceed `price`
   - Only applies when all three fields (`discountType`, `discountValue`, `price`) are present
   - Error message: "Fixed discount value cannot exceed the variant price"

### Service-Level Validation
In `product.service.ts`, the `update` method performs additional validation:

1. **Variant Attribute Validation** (`validateVariantAttributes` method):
   - **Validation A**: Each attributeId must be assigned to the product's category (through category-attribute relationships)
   - **Validation B**: Each valueId must belong to the claimed attributeId
   - **Validation C**: No duplicate attributeId within a single variant
   - **Validation D**: Each valueId must be allowed by the category's value restriction mode:
     - `NONE`: No values allowed
     - `SELECTED`: Only values explicitly selected via category-attribute-value
     - `ALL`: All values allowed (default)

2. **Transactional Behavior & Limitations**:
   - Uses database transaction when variants or images are being modified
   - **Simple Update Path**: When neither `variants` nor `images` arrays are provided (or both are empty arrays), uses direct Prisma update - ONLY updates scalar fields and category relation
   - **Transactional Path**: When `variants.length > 0` OR `images.length > 0`, uses Prisma transaction for full consistency
   - **KNOWN LIMITATION**: The simple path does NOT process variants/images at all - so `variants: []` with no images will leave variants unchanged
   - **KNOWN LIMITATION**: When updating variants by ID, there is no SKU uniqueness check - updating a variant's SKU could create duplicates

## Response Body
On success, returns:
```json
{
  "message": "Product updated successfully",
  "data": {
    // Product object with:
    // - id, name, slug, description, productDetailsHtml
    // - isActive, createdAt, updatedAt
    // - category: { id, name, slug }
    // - variants array (with id, sku, price, stock, isActive) 
    //   NOTE: Discount fields (discountType, discountValue, discountStart, discountEnd) are NOT included
    //   NOTE: To get calculated pricing fields, call GET /products/:id after updating
    // - images array (with id, url, publicId, altText, position)
  }
}
```

**Important**: The update endpoint returns BASIC variant data without discount fields or calculated pricing. This differs from the GET endpoint which includes discount fields and calculated pricing (finalPrice, hasDiscount, etc.). If you need pricing information immediately after updating, you must make a subsequent GET request.

## Transactional Behavior
The update operation uses two different paths:

### Simple Update (No Transaction)
When BOTH `variants` and `images` arrays are NOT provided OR are empty arrays:
- Direct product update using Prisma's `update` method
- Only updates scalar fields (name, description, etc.) and category relation
- Does NOT fetch or modify variants or images
- Returns updated product with basic variant/image data (as stored in DB)

### Transactional Update
When EITHER `variants.length > 0` OR `images.length > 0`:
1. Begins Prisma transaction
2. Updates basic product fields (name, description, etc.)
3. Handles images:
   - Updates existing images by ID
   - Creates new images
   - Soft deletes images not in request array
4. Handles variants:
   - Updates existing variants by ID
   - Upserts variants by SKU (requires BOTH sku and price to match existing)
   - Handles attribute binding updates/deletes
   - Soft deletes variants not in request array
5. Commits transaction and returns final product state

## Error Handling
### Validation Errors
- Returns 400 Bad Request with validation error messages from class-validator
- Custom validator messages as defined above

### Not Found Errors
- Returns 404 Not Found if product with given ID doesn't exist
- Returns 404 Not Found if referenced categoryId doesn't exist
- Returns 404 Not Found if variant attribute valueId doesn't exist

### Conflict Errors
- Returns 409 Conflict if attempting to create variant with duplicate combination key (attributes)
- Returns 409 Conflict if product slug already exists (though less relevant for update)

### Business Rule Errors
- Returns 400 Bad Request for variant attribute validation failures (category mismatch, invalid value, etc.)
- Returns 400 Bad Request for fixed discount exceeding price

## Related APIs
These APIs work in conjunction with the product update API:

### 1. Toggle Product Active Status
- **Endpoint**: `PATCH /products/:id/toggle-active`
- **Description**: Flips the `isActive` status of a product
- **Authentication**: Requires JWT with ADMIN role
- **Use Case**: Quickly activate/deactivate product without full update

### 2. Toggle Variant Active Status
- **Endpoint**: `PATCH /products/:id/variants/:variantId/toggle-active`
- **Description**: Flips the `isActive` status of a specific variant
- **Authentication**: Requires JWT with ADMIN role
- **Use Case**: Activate/deactivate individual variant

### 3. Remove Variant
- **Endpoint**: `DELETE /products/:id/variants/:variantId`
- **Description**: Soft deletes a specific variant (marks `isDeleted = true`)
- **Authentication**: Requires JWT with ADMIN role
- **Use Case**: Remove variant without affecting others

### 4. Delete Product Image
- **Endpoint**: `DELETE /products/:id/images/:imageId`
- **Description**: Soft deletes a specific product image
- **Authentication**: Requires JWT with ADMIN role
- **Use Case**: Remove specific image

### 5. Get Product Details
- **Endpoint**: `GET /products/:id`
- **Description**: Retrieves full product details including variants and images with calculated fields
- **Authentication**: Public (no auth required)
- **Use Case**: Fetch current state before updating OR get pricing information after updating

## Implementation Dos and Don'ts

### Dos
1. **Always validate request body** using the UpdateProductDto class before processing
2. **Use transactional path** when modifying variants or images to ensure data consistency (remember: empty arrays take simple path)
3. **Preserve existing values** for fields not provided in update request (partial update pattern)
4. **Handle SKU-based variant matching** correctly - requires BOTH sku and price for matching
5. **Soft delete** variants/images not present in request array rather than hard deleting
6. **Validate variant attributes** against category rules before saving
7. **Regenerate combination key** whenever variant attributes change
8. **Set proper timestamps** (updatedAt) automatically via Prisma
9. **Return consistent response format** with message and data object
10. **Call GET endpoint after update** if you need discount fields or calculated pricing data
11. **To delete all variants**: include at least one image OR include variants in request (even if empty objects)

### Don'ts
1. **Don't hard delete** variants or images - always use soft delete (isDeleted flag)
2. **Don't skip attribute validation** even when updating existing variants
3. **Don't allow duplicate attributeIds** within a single variant
4. **Don't ignore restriction modes** (NONE/SELECTED/ALL) when validating attribute values
5. **Don't create variants without required fields** (sku and price for new variants)
6. **Don't mismatch discount validation** - ensure FIXED discount validation runs when appropriate
7. **Don't forget to update combination key** when attributes change
8. **Don't use the same position** for multiple images without handling conflicts
9. **Don't ignore stock reservation checks** when deleting products (handled in remove method, but relevant for update context)
10. **Don't expose internal IDs** in error messages that could lead to IDOR vulnerabilities
11. **Don't assume variant SKU updates are safe** - updating SKU by ID can create duplicates (no uniqueness check). However, updating ONLY price, stock, or other non-SKU fields by ID is safe regarding SKU conflicts. **Price/stock updates by ID never cause SKU conflicts.**
12. **Don't expect discount fields in update response** - they're omitted; call GET endpoint if needed
13. **Don't send variants: [] expecting deletion** - it won't trigger variant processing; include images or non-empty variants array

## Database Operations Summary
### Product Table
- Updated fields: name, description, productDetailsHtml, isActive, categoryId, updatedAt
- categoryId change: Uses relation connect/disconnect

### ProductVariant Table
- Update operations: price, stock, sku, discount fields, combinationKey, updatedAt
- Create operations: All fields plus productId, isActive=true, isDeleted=false
- Delete operations: Set isDeleted=true, deletedAt=current timestamp
- **LIMITATION**: No SKU uniqueness check when updating by ID

### ProductImage Table
- Update operations: url, publicId, altText, position, updatedAt
- Create operations: All fields plus productId, type='PRODUCT', isDeleted=false
- Delete operations: Set isDeleted=true, deletedAt=current timestamp

### VariantAttribute Table (Join Table)
- Update operations: Delete existing bindings, create new bindings based on attributes array
- No direct update - always delete and recreate

## Example Requests

### Basic Field Update
```json
{
  "name": "Updated Product Name",
  "description": "Updated description",
  "isActive": false
}
```

### Update Variant Price and Stock (by ID)
```json
{
  "variants": [
    {
      "id": 123,
      "price": 29.99,
      "stock": 50
    }
  ]
}
```

### Add New Variant
```json
{
  "variants": [
    {
      "sku": "NEW-SKU-001",
      "price": 19.99,
      "stock": 100
    }
  ]
}
```

### Update Variant with Attributes
```json
{
  "variants": [
    {
      "id": 456,
      "attributes": [
        { "attributeId": 1, "valueId": 10 },
        { "attributeId": 2, "valueId": 20 }
      ]
    }
  ]
}
```

### Update Images
```json
{
  "images": [
    {
      "id": 789,
      "url": "https://example.com/new-image.jpg",
      "altText": "Updated alt text"
    },
    {
      "url": "https://example.com/additional-image.jpg",
      "position": 0
    }
  ]
}
```

### Combined Update (Note: triggers transactional path)
```json
{
  "name": "Updated Product",
  "isActive": true,
  "variants": [
    { "id": 1, "price": 15.99, "stock": 75 },
    { "sku": "NEW-VARIANT", "price": 20.99, "stock": 25 }
  ],
  "images": [
    { "id": 10, "url": "https://example.com/hero.jpg" },
    { "url": "https://example.com/gallery1.jpg" }
  ]
}
```

### Delete All Variants (MUST trigger transactional path)
```json
{
  "name": "Product Name",
  "images": []  // Empty array triggers transactional path to process variants
  // variants array omitted entirely -> all existing variants will be soft-deleted
}
```

### Alternative Delete All Variants
```json
{
  "name": "Product Name",
  "variants": [{}],  // Non-empty array triggers transactional path
  // No variant IDs in request -> all existing variants will be soft-deleted
}
```

### Remove All Attributes from Variant
```json
{
  "variants": [
    {
      "id": 123,
      "attributes": []  // Empty array removes all attributes
    }
  ]
}
