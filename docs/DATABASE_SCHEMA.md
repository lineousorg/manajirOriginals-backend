# Database Schema Documentation

## Overview

This document describes the database schema for the E-commerce Backend API. The application uses **PostgreSQL** as the database and **Prisma ORM** for database access and migrations.

## Database Connection

The database connection is configured via the `DATABASE_URL` environment variable:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/database_name"
```

---

## Entity Relationship Diagram

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│    User     │────────<│   Address    │         │  Category   │
│             │         │              │         │             │
│ - id        │         │ - id         │         │ - id        │
│ - email     │         │ - firstName  │         │ - name      │
│ - password  │         │ - lastName   │         │ - slug      │
│ - role      │         │ - phone      │         │ - parentId  │
└─────────────┘         │ - address    │         └─────────────┘
       │                │ - city       │                │
       │                │ - postalCode │                │
       │                │ - country    │                │
       │                │ - isDefault  │                │
       │                │ - userId     │                │
       │                └──────────────┘                │
       │                                                │
       │                                                │
       │                ┌──────────────┐                │
       └───────────────<│    Order     │                │
                        │              │                │
                        │ - id         │                │
                        │ - userId     │                │
                        │ - status     │                │
                        │ - payment... │                │
                        │ - total      │                │
                        └──────────────┘                │
                               │                        │
                               │                        │
                        ┌──────────────┐                │
                        │  OrderItem   │                │
                        │              │                │
                        │ - id         │                │
                        │ - orderId    │                │
                        │ - variantId  │                │
                        │ - quantity   │                │
                        │ - price      │                │
                        └──────────────┘                │
                               │                        │
                               │                        │
                        ┌──────────────┐         ┌─────────────┐
                        │ProductVariant│────────<│   Product   │
                        │              │         │             │
                        │ - id         │         │ - id        │
                        │ - sku        │         │ - name      │
                        │ - price      │         │ - slug      │
                        │ - stock      │         │ - desc...   │
                        │ - productId  │         │ - brand     │
                        └──────────────┘         │ - isActive  │
                               │                 │ - categoryId│
                               │                 └─────────────┘
                               │                        │
                        ┌──────────────┐                │
                        │VariantAttr.. │                │
                        │              │                │
                        │ - variantId  │                │
                        │ - attrVal... │                │
                        └──────────────┘                │
                               │                        │
                               │                        │
                        ┌──────────────┐         ┌─────────────┐
                        │AttributeValue│         │    Image    │
                        │              │         │             │
                        │ - id         │         │ - id        │
                        │ - value      │         │ - url       │
                        │ - attributeId│         │ - altText   │
                        └──────────────┘         │ - position  │
                               │                 │ - type      │
                               │                 │ - productId │
                        ┌──────────────┐         │ - variantId │
                        │  Attribute   │         └─────────────┘
                        │              │
                        │ - id         │
                        │ - name       │
                        └──────────────┘
```

---

## Tables

### User

Stores user account information with role-based access control.

| Column      | Type      | Constraints                    | Description                          |
|-------------|-----------|--------------------------------|--------------------------------------|
| id          | Integer   | PRIMARY KEY, AUTO_INCREMENT    | Unique user identifier               |
| email       | String    | UNIQUE, NOT NULL               | User's email address                 |
| password    | String    | NOT NULL                       | Hashed password (bcrypt)             |
| role        | Enum      | DEFAULT 'CUSTOMER'             | User role (ADMIN, CUSTOMER)          |
| createdAt   | DateTime  | DEFAULT now()                  | Account creation timestamp           |
| updatedAt   | DateTime  | AUTO UPDATE                    | Last update timestamp                |

**Relationships:**
- One-to-Many with `Order` (user can have multiple orders)
- One-to-Many with `Address` (user can have multiple addresses)

**Indexes:**
- Unique index on `email`

---

### Address

Stores shipping/billing addresses for users.

| Column      | Type      | Constraints                    | Description                          |
|-------------|-----------|--------------------------------|--------------------------------------|
| id          | Integer   | PRIMARY KEY, AUTO_INCREMENT    | Unique address identifier            |
| firstName   | String    | NOT NULL                       | First name                           |
| lastName    | String    | NOT NULL                       | Last name                            |
| phone       | String    | NOT NULL                       | Contact phone number                 |
| address     | String    | NOT NULL                       | Street address                       |
| city        | String    | NULLABLE                       | City name                            |
| postalCode  | String    | NULLABLE                       | Postal/ZIP code                      |
| country     | String    | NULLABLE                       | Country name                         |
| isDefault   | Boolean   | DEFAULT false                  | Whether this is the default address  |
| userId      | Integer   | FOREIGN KEY, NOT NULL          | Reference to User                    |
| createdAt   | DateTime  | DEFAULT now()                  | Creation timestamp                   |
| updatedAt   | DateTime  | AUTO UPDATE                    | Last update timestamp                |

**Relationships:**
- Many-to-One with `User`

**Business Rules:**
- Only one address per user can be set as default
- When setting a new default, previous default is automatically unset

---

### Category

Hierarchical category structure for organizing products.

| Column      | Type      | Constraints                    | Description                          |
|-------------|-----------|--------------------------------|--------------------------------------|
| id          | Integer   | PRIMARY KEY, AUTO_INCREMENT    | Unique category identifier           |
| name        | String    | NOT NULL                       | Category name                        |
| slug        | String    | UNIQUE, NOT NULL               | URL-friendly identifier              |
| parentId    | Integer   | FOREIGN KEY, NULLABLE          | Parent category (for hierarchy)      |
| createdAt   | DateTime  | DEFAULT now()                  | Creation timestamp                   |
| updatedAt   | DateTime  | AUTO UPDATE                    | Last update timestamp                |

**Relationships:**
- Self-referencing (parent-child hierarchy)
- One-to-Many with `Product`

**Indexes:**
- Unique index on `slug`

**Example Hierarchy:**
```
Clothing (parentId: null)
  ├── T-Shirts (parentId: 1)
  ├── Jeans (parentId: 1)
  └── Jackets (parentId: 1)
```

---

### Product

Main product information.

| Column      | Type      | Constraints                    | Description                          |
|-------------|-----------|--------------------------------|--------------------------------------|
| id          | Integer   | PRIMARY KEY, AUTO_INCREMENT    | Unique product identifier            |
| name        | String    | NOT NULL                       | Product name                         |
| slug        | String    | UNIQUE, NOT NULL               | URL-friendly identifier              |
| description | String    | NULLABLE                       | Product description                  |
| brand       | String    | NULLABLE                       | Brand name                           |
| isActive    | Boolean   | DEFAULT true                   | Whether product is active/visible    |
| categoryId  | Integer   | FOREIGN KEY, NOT NULL          | Reference to Category                |
| createdAt   | DateTime  | DEFAULT now()                  | Creation timestamp                   |
| updatedAt   | DateTime  | AUTO UPDATE                    | Last update timestamp                |

**Relationships:**
- Many-to-One with `Category`
- One-to-Many with `ProductVariant`
- One-to-Many with `Image`

**Indexes:**
- Unique index on `slug`

---

### ProductVariant

Product variations with specific attributes (size, color, etc.) and pricing.

| Column      | Type      | Constraints                    | Description                          |
|-------------|-----------|--------------------------------|--------------------------------------|
| id          | Integer   | PRIMARY KEY, AUTO_INCREMENT    | Unique variant identifier            |
| sku         | String    | UNIQUE, NOT NULL               | Stock Keeping Unit                   |
| price       | Decimal   | NOT NULL, DECIMAL(10,2)        | Variant price                        |
| stock       | Integer   | NOT NULL                       | Available quantity                   |
| productId   | Integer   | FOREIGN KEY, NOT NULL          | Reference to Product                 |
| createdAt   | DateTime  | DEFAULT now()                  | Creation timestamp                   |
| updatedAt   | DateTime  | AUTO UPDATE                    | Last update timestamp                |

**Relationships:**
- Many-to-One with `Product`
- Many-to-Many with `AttributeValue` (through `VariantAttribute`)
- One-to-Many with `Image`
- One-to-Many with `OrderItem`

**Indexes:**
- Unique index on `sku`

**Example:**
```
Product: "Classic T-Shirt"
  Variant 1: SKU="TS-001-S-BLK", Size=Small, Color=Black, Price=$29.99, Stock=50
  Variant 2: SKU="TS-001-M-BLK", Size=Medium, Color=Black, Price=$29.99, Stock=75
  Variant 3: SKU="TS-001-S-WHT", Size=Small, Color=White, Price=$29.99, Stock=30
```

---

### Attribute

Defines attribute types (e.g., Size, Color, Material).

| Column      | Type      | Constraints                    | Description                          |
|-------------|-----------|--------------------------------|--------------------------------------|
| id          | Integer   | PRIMARY KEY, AUTO_INCREMENT    | Unique attribute identifier          |
| name        | String    | UNIQUE, NOT NULL               | Attribute name (e.g., "Size")        |

**Relationships:**
- One-to-Many with `AttributeValue`

**Examples:**
- Size
- Color
- Material
- Style

---

### AttributeValue

Specific values for attributes (e.g., "Small", "Black").

| Column      | Type      | Constraints                    | Description                          |
|-------------|-----------|--------------------------------|--------------------------------------|
| id          | Integer   | PRIMARY KEY, AUTO_INCREMENT    | Unique value identifier              |
| value       | String    | NOT NULL                       | Attribute value (e.g., "Small")      |
| attributeId | Integer   | FOREIGN KEY, NOT NULL          | Reference to Attribute               |

**Relationships:**
- Many-to-One with `Attribute`
- Many-to-Many with `ProductVariant` (through `VariantAttribute`)

**Examples:**
```
Attribute: "Size"
  - Small
  - Medium
  - Large
  - X-Large

Attribute: "Color"
  - Black
  - White
  - Red
  - Blue
```

---

### VariantAttribute

Junction table linking variants to their attribute values.

| Column           | Type      | Constraints                    | Description                          |
|------------------|-----------|--------------------------------|--------------------------------------|
| variantId        | Integer   | FOREIGN KEY, PRIMARY KEY       | Reference to ProductVariant          |
| attributeValueId | Integer   | FOREIGN KEY, PRIMARY KEY       | Reference to AttributeValue          |

**Composite Primary Key:** (variantId, attributeValueId)

**Relationships:**
- Many-to-One with `ProductVariant`
- Many-to-One with `AttributeValue`

**Example:**
```
Variant: "TS-001-S-BLK"
  - Size: Small (variantId=1, attributeValueId=1)
  - Color: Black (variantId=1, attributeValueId=5)
```

---

### Image

Stores product and variant images.

| Column      | Type      | Constraints                    | Description                          |
|-------------|-----------|--------------------------------|--------------------------------------|
| id          | Integer   | PRIMARY KEY, AUTO_INCREMENT    | Unique image identifier              |
| url         | String    | NOT NULL                       | Image URL or base64 data             |
| altText     | String    | NULLABLE                       | Alternative text for accessibility   |
| position    | Integer   | NOT NULL                       | Display order                        |
| type        | Enum      | NOT NULL                       | PRODUCT or VARIANT                   |
| productId   | Integer   | FOREIGN KEY, NULLABLE          | Reference to Product (if type=PRODUCT)|
| variantId   | Integer   | FOREIGN KEY, NULLABLE          | Reference to Variant (if type=VARIANT)|
| createdAt   | DateTime  | DEFAULT now()                  | Creation timestamp                   |

**Relationships:**
- Many-to-One with `Product` (optional)
- Many-to-One with `ProductVariant` (optional)

**Business Rules:**
- If `type` is `PRODUCT`, `productId` must be set and `variantId` must be null
- If `type` is `VARIANT`, `variantId` must be set and `productId` must be null

---

### Order

Customer orders.

| Column        | Type      | Constraints                    | Description                          |
|---------------|-----------|--------------------------------|--------------------------------------|
| id            | Integer   | PRIMARY KEY, AUTO_INCREMENT    | Unique order identifier              |
| userId        | Integer   | FOREIGN KEY, NOT NULL          | Reference to User                    |
| status        | Enum      | DEFAULT 'PENDING'              | Order status                         |
| paymentMethod | Enum      | DEFAULT 'CASH_ON_DELIVERY'     | Payment method                       |
| total         | Decimal   | NOT NULL, DECIMAL(10,2)        | Order total amount                   |
| createdAt     | DateTime  | DEFAULT now()                  | Order creation timestamp             |
| updatedAt     | DateTime  | AUTO UPDATE                    | Last update timestamp                |

**Relationships:**
- Many-to-One with `User`
- One-to-Many with `OrderItem`

**Status Enum Values:**
- `PENDING` - Order placed, awaiting payment
- `PAID` - Payment received
- `SHIPPED` - Order shipped to customer
- `DELIVERED` - Order delivered successfully
- `CANCELLED` - Order cancelled

**Payment Method Enum Values:**
- `CASH_ON_DELIVERY` - Pay on delivery
- `ONLINE` - Generic online payment
- `STRIPE` - Stripe payment gateway
- `SSLCOMMERZ` - SSLCommerz payment gateway

---

### OrderItem

Individual items within an order.

| Column      | Type      | Constraints                    | Description                          |
|-------------|-----------|--------------------------------|--------------------------------------|
| id          | Integer   | PRIMARY KEY, AUTO_INCREMENT    | Unique order item identifier         |
| orderId     | Integer   | FOREIGN KEY, NOT NULL          | Reference to Order                   |
| variantId   | Integer   | FOREIGN KEY, NOT NULL          | Reference to ProductVariant          |
| quantity    | Integer   | NOT NULL                       | Quantity ordered                     |
| price       | Decimal   | NOT NULL, DECIMAL(10,2)        | Price at time of order               |

**Relationships:**
- Many-to-One with `Order`
- Many-to-One with `ProductVariant`

**Business Rules:**
- Price is captured at order time to preserve historical pricing
- Quantity must be greater than 0
- Stock is validated before order creation

---

## Enums

### Role
```typescript
enum Role {
  ADMIN      // Full system access
  CUSTOMER   // Customer access
}
```

### ImageType
```typescript
enum ImageType {
  PRODUCT    // Product-level image
  VARIANT    // Variant-specific image
}
```

### OrderStatus
```typescript
enum OrderStatus {
  PENDING    // Order placed, awaiting payment
  PAID       // Payment received
  SHIPPED    // Order shipped
  DELIVERED  // Order delivered
  CANCELLED  // Order cancelled
}
```

### PaymentMethod
```typescript
enum PaymentMethod {
  CASH_ON_DELIVERY  // Pay on delivery
  ONLINE            // Generic online payment
  STRIPE            // Stripe payment
  SSLCOMMERZ        // SSLCommerz payment
}
```

---

## Indexes

### Unique Indexes
- `User.email`
- `Category.slug`
- `Product.slug`
- `ProductVariant.sku`
- `Attribute.name`

### Foreign Key Indexes
Prisma automatically creates indexes for foreign keys:
- `Address.userId`
- `Product.categoryId`
- `ProductVariant.productId`
- `AttributeValue.attributeId`
- `VariantAttribute.variantId`
- `VariantAttribute.attributeValueId`
- `Image.productId`
- `Image.variantId`
- `Order.userId`
- `OrderItem.orderId`
- `OrderItem.variantId`

---

## Migrations

### Running Migrations

```bash
# Generate Prisma Client
npx prisma generate

# Create a new migration
npx prisma migrate dev --name migration_name

# Apply migrations in production
npx prisma migrate deploy

# Reset database (development only)
npx prisma migrate reset
```

### Viewing Database

```bash
# Open Prisma Studio (GUI)
npx prisma studio
```

---

## Seeding

The database can be seeded with sample data:

```bash
npx prisma db seed
```

The seed script creates:
- Admin user (admin@example.com / Admin123)
- Sample categories
- Sample products with variants
- Sample attributes (Size, Color)

---

## Data Integrity

### Cascading Deletes

The schema implements cascading deletes for related data:

- Deleting a `User` will delete all related `Orders` and `Addresses`
- Deleting a `Product` will delete all related `ProductVariants` and `Images`
- Deleting a `Category` will fail if it has associated products
- Deleting an `Order` will delete all related `OrderItems`

### Constraints

- Email addresses must be unique
- SKUs must be unique
- Category and product slugs must be unique
- Only one default address per user
- Order total must match sum of order items

---

## Performance Considerations

1. **Indexes**: All foreign keys and unique fields are indexed
2. **Eager Loading**: Use Prisma's `include` to avoid N+1 queries
3. **Pagination**: Implement pagination for large datasets
4. **Caching**: Consider caching frequently accessed data (categories, products)
5. **Connection Pooling**: Configure appropriate connection pool size

---

## Backup and Recovery

### Backup Database

```bash
# PostgreSQL backup
pg_dump -U username -d database_name > backup.sql

# Restore from backup
psql -U username -d database_name < backup.sql
```

### Export Data

```bash
# Export specific table
pg_dump -U username -d database_name -t table_name > table_backup.sql
```

---

## Security Considerations

1. **Password Storage**: Passwords are hashed using bcrypt
2. **SQL Injection**: Prisma provides protection against SQL injection
3. **Access Control**: Role-based access control implemented at application level
4. **Data Validation**: Input validation using class-validator
5. **Environment Variables**: Sensitive data stored in environment variables

---

## Schema Version

**Current Version**: 1.0.0  
**Last Updated**: 2026-02-17  
**Prisma Version**: 6.19.2
