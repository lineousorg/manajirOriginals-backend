# API Documentation

## Base URL
```
http://localhost:5000/api
```

All API endpoints are prefixed with `/api`.

## Table of Contents
- [Authentication](#authentication)
- [Users](#users)
- [Products](#products)
- [Categories](#categories)
- [Orders](#orders)
- [Addresses](#addresses)
- [Attributes](#attributes)
- [Attribute Values](#attribute-values)
- [Error Handling](#error-handling)

---

## Authentication

### Sign Up
Create a new user account.

**Endpoint:** `POST /api/auth/signup`

**Access:** Public

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "Password123"
}
```

**Validation Rules:**
- `email`: Must be a valid email address
- `password`: 
  - Minimum 8 characters
  - Must contain at least one uppercase letter
  - Must contain at least one lowercase letter
  - Must contain at least one number

**Success Response (201):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "role": "CUSTOMER"
  }
}
```

---

### Customer Login
Authenticate as a customer.

**Endpoint:** `POST /api/auth/login`

**Access:** Public

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "Password123"
}
```

**Success Response (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "role": "CUSTOMER"
  }
}
```

---

### Admin Login
Authenticate as an administrator.

**Endpoint:** `POST /api/auth/admin/login`

**Access:** Public

**Request Body:**
```json
{
  "email": "admin@example.com",
  "password": "AdminPassword123"
}
```

**Success Response (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "admin@example.com",
    "role": "ADMIN"
  }
}
```

---

## Users

All user endpoints require authentication. Include the JWT token in the Authorization header:
```
Authorization: Bearer <your_token>
```

### Create User
Create a new user (Admin only).

**Endpoint:** `POST /api/users`

**Access:** Admin only

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Request Body:**
```json
{
  "email": "newuser@example.com",
  "password": "Password123",
  "role": "CUSTOMER"
}
```

**Success Response (201):**
```json
{
  "id": 2,
  "email": "newuser@example.com",
  "role": "CUSTOMER",
  "createdAt": "2026-02-17T06:00:00.000Z",
  "updatedAt": "2026-02-17T06:00:00.000Z"
}
```

---

### Get All Users
Retrieve all users (Admin only).

**Endpoint:** `GET /api/users`

**Access:** Admin only

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Success Response (200):**
```json
[
  {
    "id": 1,
    "email": "admin@example.com",
    "role": "ADMIN",
    "createdAt": "2026-02-17T06:00:00.000Z",
    "updatedAt": "2026-02-17T06:00:00.000Z"
  },
  {
    "id": 2,
    "email": "user@example.com",
    "role": "CUSTOMER",
    "createdAt": "2026-02-17T06:00:00.000Z",
    "updatedAt": "2026-02-17T06:00:00.000Z"
  }
]
```

---

### Get User by ID
Retrieve a specific user. Users can view their own profile, admins can view any.

**Endpoint:** `GET /api/users/:id`

**Access:** Authenticated (own profile) or Admin (any profile)

**Headers:**
```
Authorization: Bearer <token>
```

**Success Response (200):**
```json
{
  "id": 1,
  "email": "user@example.com",
  "role": "CUSTOMER",
  "createdAt": "2026-02-17T06:00:00.000Z",
  "updatedAt": "2026-02-17T06:00:00.000Z"
}
```

---

### Update User
Update user information. Users can update their own profile, admins can update any.

**Endpoint:** `PATCH /api/users/:id`

**Access:** Authenticated (own profile) or Admin (any profile)

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "email": "newemail@example.com",
  "password": "NewPassword123"
}
```

**Success Response (200):**
```json
{
  "id": 1,
  "email": "newemail@example.com",
  "role": "CUSTOMER",
  "createdAt": "2026-02-17T06:00:00.000Z",
  "updatedAt": "2026-02-17T06:15:00.000Z"
}
```

---

### Delete User
Delete a user (Admin only).

**Endpoint:** `DELETE /api/users/:id`

**Access:** Admin only

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Success Response (200):**
```json
{
  "message": "User deleted successfully"
}
```

---

## Products

### Get All Products
Retrieve all active products with their variants and images.

**Endpoint:** `GET /api/products`

**Access:** Public

**Success Response (200):**
```json
[
  {
    "id": 1,
    "name": "Classic T-Shirt",
    "slug": "classic-t-shirt",
    "description": "Comfortable cotton t-shirt",
    "brand": "Fashion Brand",
    "isActive": true,
    "categoryId": 1,
    "category": {
      "id": 1,
      "name": "T-Shirts",
      "slug": "t-shirts"
    },
    "variants": [
      {
        "id": 1,
        "sku": "TS-001-S-BLK",
        "price": "29.99",
        "stock": 50,
        "attributes": [
          {
            "attributeValue": {
              "id": 1,
              "value": "Small",
              "attribute": {
                "id": 1,
                "name": "Size"
              }
            }
          },
          {
            "attributeValue": {
              "id": 5,
              "value": "Black",
              "attribute": {
                "id": 2,
                "name": "Color"
              }
            }
          }
        ],
        "images": []
      }
    ],
    "images": [
      {
        "id": 1,
        "url": "https://example.com/image.jpg",
        "altText": "Classic T-Shirt",
        "position": 1,
        "type": "PRODUCT"
      }
    ],
    "createdAt": "2026-02-17T06:00:00.000Z",
    "updatedAt": "2026-02-17T06:00:00.000Z"
  }
]
```

---

### Get Product by ID
Retrieve a specific product with all details.

**Endpoint:** `GET /api/products/:id`

**Access:** Public

**Success Response (200):**
```json
{
  "id": 1,
  "name": "Classic T-Shirt",
  "slug": "classic-t-shirt",
  "description": "Comfortable cotton t-shirt",
  "brand": "Fashion Brand",
  "isActive": true,
  "categoryId": 1,
  "category": {
    "id": 1,
    "name": "T-Shirts",
    "slug": "t-shirts"
  },
  "variants": [
    {
      "id": 1,
      "sku": "TS-001-S-BLK",
      "price": "29.99",
      "stock": 50,
      "attributes": [
        {
          "attributeValue": {
            "id": 1,
            "value": "Small",
            "attribute": {
              "id": 1,
              "name": "Size"
            }
          }
        }
      ]
    }
  ],
  "images": [],
  "createdAt": "2026-02-17T06:00:00.000Z",
  "updatedAt": "2026-02-17T06:00:00.000Z"
}
```

---

### Create Product
Create a new product with variants and attributes (Admin only).

**Endpoint:** `POST /api/products`

**Access:** Admin only

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Request Body:**
```json
{
  "name": "Classic T-Shirt",
  "slug": "classic-t-shirt",
  "description": "Comfortable cotton t-shirt",
  "categoryId": 1,
  "isActive": true,
  "variants": [
    {
      "sku": "TS-001-S-BLK",
      "price": 29.99,
      "stock": 50,
      "attributes": [
        {
          "attributeName": "Size",
          "attributeValue": "Small"
        },
        {
          "attributeName": "Color",
          "attributeValue": "Black"
        }
      ]
    }
  ],
  "images": [
    {
      "url": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
      "altText": "Classic T-Shirt",
      "position": 1
    }
  ]
}
```

**Success Response (201):**
```json
{
  "id": 1,
  "name": "Classic T-Shirt",
  "slug": "classic-t-shirt",
  "description": "Comfortable cotton t-shirt",
  "brand": null,
  "isActive": true,
  "categoryId": 1,
  "createdAt": "2026-02-17T06:00:00.000Z",
  "updatedAt": "2026-02-17T06:00:00.000Z"
}
```

---

### Update Product
Update an existing product (Admin only).

**Endpoint:** `PATCH /api/products/:id`

**Access:** Admin only

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Request Body:**
```json
{
  "name": "Updated T-Shirt Name",
  "description": "Updated description",
  "isActive": false
}
```

**Success Response (200):**
```json
{
  "id": 1,
  "name": "Updated T-Shirt Name",
  "slug": "classic-t-shirt",
  "description": "Updated description",
  "brand": null,
  "isActive": false,
  "categoryId": 1,
  "createdAt": "2026-02-17T06:00:00.000Z",
  "updatedAt": "2026-02-17T06:15:00.000Z"
}
```

---

### Delete Product
Delete a product (Admin only).

**Endpoint:** `DELETE /api/products/:id`

**Access:** Admin only

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Success Response (200):**
```json
{
  "message": "Product deleted successfully"
}
```

---

## Categories

### Get All Categories
Retrieve all categories with their hierarchy.

**Endpoint:** `GET /api/categories`

**Access:** Public

**Success Response (200):**
```json
[
  {
    "id": 1,
    "name": "Clothing",
    "slug": "clothing",
    "parentId": null,
    "children": [
      {
        "id": 2,
        "name": "T-Shirts",
        "slug": "t-shirts",
        "parentId": 1
      },
      {
        "id": 3,
        "name": "Jeans",
        "slug": "jeans",
        "parentId": 1
      }
    ],
    "createdAt": "2026-02-17T06:00:00.000Z",
    "updatedAt": "2026-02-17T06:00:00.000Z"
  }
]
```

---

### Get Category by ID
Retrieve a specific category with its products.

**Endpoint:** `GET /api/categories/:id`

**Access:** Public

**Success Response (200):**
```json
{
  "id": 1,
  "name": "Clothing",
  "slug": "clothing",
  "parentId": null,
  "products": [
    {
      "id": 1,
      "name": "Classic T-Shirt",
      "slug": "classic-t-shirt",
      "description": "Comfortable cotton t-shirt",
      "isActive": true
    }
  ],
  "children": [],
  "createdAt": "2026-02-17T06:00:00.000Z",
  "updatedAt": "2026-02-17T06:00:00.000Z"
}
```

---

### Create Category
Create a new category (Admin only).

**Endpoint:** `POST /api/categories`

**Access:** Admin only

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Request Body:**
```json
{
  "name": "T-Shirts",
  "slug": "t-shirts",
  "parentId": 1
}
```

**Success Response (201):**
```json
{
  "id": 2,
  "name": "T-Shirts",
  "slug": "t-shirts",
  "parentId": 1,
  "createdAt": "2026-02-17T06:00:00.000Z",
  "updatedAt": "2026-02-17T06:00:00.000Z"
}
```

---

### Delete Category
Delete a category (Admin only).

**Endpoint:** `DELETE /api/categories/:id`

**Access:** Admin only

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Success Response (200):**
```json
{
  "message": "Category deleted successfully"
}
```

---

## Orders

All order endpoints require authentication.

### Create Order
Create a new order.

**Endpoint:** `POST /api/orders`

**Access:** Authenticated users

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "items": [
    {
      "variantId": 1,
      "quantity": 2
    },
    {
      "variantId": 3,
      "quantity": 1
    }
  ],
  "paymentMethod": "CASH_ON_DELIVERY"
}
```

**Payment Methods:**
- `CASH_ON_DELIVERY`
- `ONLINE`
- `STRIPE`
- `SSLCOMMERZ`

**Success Response (201):**
```json
{
  "id": 1,
  "userId": 1,
  "status": "PENDING",
  "paymentMethod": "CASH_ON_DELIVERY",
  "total": "89.97",
  "items": [
    {
      "id": 1,
      "variantId": 1,
      "quantity": 2,
      "price": "29.99",
      "variant": {
        "id": 1,
        "sku": "TS-001-S-BLK",
        "product": {
          "id": 1,
          "name": "Classic T-Shirt"
        }
      }
    }
  ],
  "createdAt": "2026-02-17T06:00:00.000Z",
  "updatedAt": "2026-02-17T06:00:00.000Z"
}
```

---

### Get All Orders
Retrieve orders. Admins see all orders, customers see only their own.

**Endpoint:** `GET /api/orders`

**Access:** Authenticated users

**Headers:**
```
Authorization: Bearer <token>
```

**Success Response (200):**
```json
[
  {
    "id": 1,
    "userId": 1,
    "status": "PENDING",
    "paymentMethod": "CASH_ON_DELIVERY",
    "total": "89.97",
    "items": [
      {
        "id": 1,
        "variantId": 1,
        "quantity": 2,
        "price": "29.99"
      }
    ],
    "createdAt": "2026-02-17T06:00:00.000Z",
    "updatedAt": "2026-02-17T06:00:00.000Z"
  }
]
```

---

### Get Order by ID
Retrieve a specific order. Admins can view any order, customers can view only their own.

**Endpoint:** `GET /api/orders/:id`

**Access:** Authenticated users (own orders) or Admin (any order)

**Headers:**
```
Authorization: Bearer <token>
```

**Success Response (200):**
```json
{
  "id": 1,
  "userId": 1,
  "status": "PENDING",
  "paymentMethod": "CASH_ON_DELIVERY",
  "total": "89.97",
  "items": [
    {
      "id": 1,
      "variantId": 1,
      "quantity": 2,
      "price": "29.99",
      "variant": {
        "id": 1,
        "sku": "TS-001-S-BLK",
        "product": {
          "id": 1,
          "name": "Classic T-Shirt"
        }
      }
    }
  ],
  "user": {
    "id": 1,
    "email": "user@example.com"
  },
  "createdAt": "2026-02-17T06:00:00.000Z",
  "updatedAt": "2026-02-17T06:00:00.000Z"
}
```

---

### Update Order Status
Update the status of an order (Admin only).

**Endpoint:** `PATCH /api/orders/:id/status`

**Access:** Admin only

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Request Body:**
```json
{
  "status": "SHIPPED"
}
```

**Order Status Values:**
- `PENDING` - Order placed, awaiting payment
- `PAID` - Payment received
- `SHIPPED` - Order shipped
- `DELIVERED` - Order delivered to customer
- `CANCELLED` - Order cancelled

**Success Response (200):**
```json
{
  "id": 1,
  "userId": 1,
  "status": "SHIPPED",
  "paymentMethod": "CASH_ON_DELIVERY",
  "total": "89.97",
  "createdAt": "2026-02-17T06:00:00.000Z",
  "updatedAt": "2026-02-17T06:15:00.000Z"
}
```

---

## Addresses

All address endpoints require authentication.

### Create Address
Create a new address for the authenticated user.

**Endpoint:** `POST /api/addresses`

**Access:** Authenticated users

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890",
  "address": "123 Main Street, Apt 4B",
  "city": "New York",
  "postalCode": "10001",
  "country": "USA",
  "isDefault": true
}
```

**Success Response (201):**
```json
{
  "id": 1,
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890",
  "address": "123 Main Street, Apt 4B",
  "city": "New York",
  "postalCode": "10001",
  "country": "USA",
  "isDefault": true,
  "userId": 1,
  "createdAt": "2026-02-17T06:00:00.000Z",
  "updatedAt": "2026-02-17T06:00:00.000Z"
}
```

---

### Get All Addresses
Retrieve all addresses for the authenticated user.

**Endpoint:** `GET /api/addresses`

**Access:** Authenticated users

**Headers:**
```
Authorization: Bearer <token>
```

**Success Response (200):**
```json
[
  {
    "id": 1,
    "firstName": "John",
    "lastName": "Doe",
    "phone": "+1234567890",
    "address": "123 Main Street, Apt 4B",
    "city": "New York",
    "postalCode": "10001",
    "country": "USA",
    "isDefault": true,
    "userId": 1,
    "createdAt": "2026-02-17T06:00:00.000Z",
    "updatedAt": "2026-02-17T06:00:00.000Z"
  }
]
```

---

### Get Address by ID
Retrieve a specific address (owner only).

**Endpoint:** `GET /api/addresses/:id`

**Access:** Authenticated users (own addresses only)

**Headers:**
```
Authorization: Bearer <token>
```

**Success Response (200):**
```json
{
  "id": 1,
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890",
  "address": "123 Main Street, Apt 4B",
  "city": "New York",
  "postalCode": "10001",
  "country": "USA",
  "isDefault": true,
  "userId": 1,
  "createdAt": "2026-02-17T06:00:00.000Z",
  "updatedAt": "2026-02-17T06:00:00.000Z"
}
```

---

### Update Address
Update an existing address (owner only).

**Endpoint:** `PATCH /api/addresses/:id`

**Access:** Authenticated users (own addresses only)

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "phone": "+0987654321",
  "city": "Los Angeles",
  "postalCode": "90001"
}
```

**Success Response (200):**
```json
{
  "id": 1,
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+0987654321",
  "address": "123 Main Street, Apt 4B",
  "city": "Los Angeles",
  "postalCode": "90001",
  "country": "USA",
  "isDefault": true,
  "userId": 1,
  "createdAt": "2026-02-17T06:00:00.000Z",
  "updatedAt": "2026-02-17T06:15:00.000Z"
}
```

---

### Delete Address
Delete an address (owner only).

**Endpoint:** `DELETE /api/addresses/:id`

**Access:** Authenticated users (own addresses only)

**Headers:**
```
Authorization: Bearer <token>
```

**Success Response (200):**
```json
{
  "message": "Address deleted successfully"
}
```

---

### Set Default Address
Set an address as the default address (owner only).

**Endpoint:** `PATCH /api/addresses/:id/set-default`

**Access:** Authenticated users (own addresses only)

**Headers:**
```
Authorization: Bearer <token>
```

**Success Response (200):**
```json
{
  "id": 1,
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890",
  "address": "123 Main Street, Apt 4B",
  "city": "New York",
  "postalCode": "10001",
  "country": "USA",
  "isDefault": true,
  "userId": 1,
  "createdAt": "2026-02-17T06:00:00.000Z",
  "updatedAt": "2026-02-17T06:15:00.000Z"
}
```

---

## Attributes

All attribute endpoints are public. Attributes define types of product characteristics (e.g., "Color", "Size", "Material").

### Create Attribute
Create a new attribute.

**Endpoint:** `POST /api/attributes`

**Access:** Public

**Request Body:**
```json
{
  "name": "Color"
}
```

**Validation Rules:**
- `name`: Required, must be unique

**Success Response (201):**
```json
{
  "message": "Attribute created successfully",
  "status": "success",
  "data": {
    "id": 1,
    "name": "Color"
  }
}
```

---

### Get All Attributes
Retrieve all attributes.

**Endpoint:** `GET /api/attributes`

**Access:** Public

**Success Response (200):**
```json
{
  "message": "Attributes retrieved successfully",
  "status": "success",
  "data": [
    {
      "id": 1,
      "name": "Color"
    },
    {
      "id": 2,
      "name": "Size"
    }
  ]
}
```

---

### Get Attribute by ID
Retrieve a specific attribute with its values.

**Endpoint:** `GET /api/attributes/:id`

**Access:** Public

**Success Response (200):**
```json
{
  "message": "Attribute retrieved successfully",
  "status": "success",
  "data": {
    "id": 1,
    "name": "Color",
    "values": [
      {
        "id": 1,
        "value": "Red",
        "attributeId": 1
      },
      {
        "id": 2,
        "value": "Blue",
        "attributeId": 1
      }
    ]
  }
}
```

---

### Update Attribute
Update an existing attribute.

**Endpoint:** `PATCH /api/attributes/:id`

**Access:** Public

**Request Body:**
```json
{
  "name": "New Color Name"
}
```

**Success Response (200):**
```json
{
  "message": "Attribute updated successfully",
  "status": "success",
  "data": {
    "id": 1,
    "name": "New Color Name"
  }
}
```

---

### Delete Attribute
Delete an attribute. This will also delete all associated attribute values.

**Endpoint:** `DELETE /api/attributes/:id`

**Access:** Public

**Success Response (200):**
```json
{
  "message": "Attribute deleted successfully",
  "status": "success",
  "data": null
}
```

---

## Attribute Values

All attribute value endpoints are public. Attribute values represent possible options for an attribute (e.g., "Red", "Blue" for Color, or "Small", "Medium", "Large" for Size).

### Create Attribute Value
Create a new attribute value.

**Endpoint:** `POST /api/attribute-values`

**Access:** Public

**Request Body:**
```json
{
  "value": "Red",
  "attributeId": 1
}
```

**Validation Rules:**
- `value`: Required
- `attributeId`: Required, must be a valid attribute ID

**Success Response (201):**
```json
{
  "message": "Attribute value created successfully",
  "status": "success",
  "data": {
    "id": 1,
    "value": "Red",
    "attributeId": 1
  }
}
```

---

### Get All Attribute Values
Retrieve all attribute values with their parent attribute info.

**Endpoint:** `GET /api/attribute-values`

**Access:** Public

**Success Response (200):**
```json
{
  "message": "Attribute values retrieved successfully",
  "status": "success",
  "data": [
    {
      "id": 1,
      "value": "Red",
      "attributeId": 1,
      "attribute": {
        "id": 1,
        "name": "Color"
      }
    },
    {
      "id": 2,
      "value": "Blue",
      "attributeId": 1,
      "attribute": {
        "id": 1,
        "name": "Color"
      }
    }
  ]
}
```

---

### Get Attribute Values by Attribute
Retrieve all values for a specific attribute.

**Endpoint:** `GET /api/attribute-values/attribute/:attributeId`

**Access:** Public

**Success Response (200):**
```json
{
  "message": "Attribute values retrieved successfully",
  "status": "success",
  "data": [
    {
      "id": 1,
      "value": "Red",
      "attributeId": 1
    },
    {
      "id": 2,
      "value": "Blue",
      "attributeId": 1
    }
  ]
}
```

---

### Get Attribute Value by ID
Retrieve a specific attribute value.

**Endpoint:** `GET /api/attribute-values/:id`

**Access:** Public

**Success Response (200):**
```json
{
  "message": "Attribute value retrieved successfully",
  "status": "success",
  "data": {
    "id": 1,
    "value": "Red",
    "attributeId": 1,
    "attribute": {
      "id": 1,
      "name": "Color"
    }
  }
}
```

---

### Update Attribute Value
Update an existing attribute value.

**Endpoint:** `PATCH /api/attribute-values/:id`

**Access:** Public

**Request Body:**
```json
{
  "value": "Navy Blue"
}
```

**Success Response (200):**
```json
{
  "message": "Attribute value updated successfully",
  "status": "success",
  "data": {
    "id": 1,
    "value": "Navy Blue",
    "attributeId": 1
  }
}
```

---

### Delete Attribute Value
Delete an attribute value. This will also remove the value from all variant attributes.

**Endpoint:** `DELETE /api/attribute-values/:id`

**Access:** Public

**Success Response (200):**
```json
{
  "message": "Attribute value deleted successfully",
  "status": "success",
  "data": null
}
```

---

## Error Handling

### Error Response Format

All errors follow a consistent format:

```json
{
  "statusCode": 400,
  "message": "Error message describing what went wrong",
  "error": "Bad Request"
}
```

### Common HTTP Status Codes

- **200 OK** - Request succeeded
- **201 Created** - Resource created successfully
- **400 Bad Request** - Invalid request data
- **401 Unauthorized** - Missing or invalid authentication token
- **403 Forbidden** - Insufficient permissions
- **404 Not Found** - Resource not found
- **409 Conflict** - Resource already exists (e.g., duplicate email)
- **500 Internal Server Error** - Server error

### Validation Errors

When validation fails, the response includes detailed error messages:

```json
{
  "statusCode": 400,
  "message": [
    "email must be a valid email address",
    "password must be at least 8 characters long"
  ],
  "error": "Bad Request"
}
```

### Authentication Errors

**Missing Token:**
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

**Invalid Token:**
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

**Insufficient Permissions:**
```json
{
  "statusCode": 403,
  "message": "Forbidden resource"
}
```

---

## Rate Limiting

Currently, there are no rate limits implemented. Consider implementing rate limiting for production use.

---

## CORS Configuration

The API allows requests from:
- `http://localhost:3000`
- `http://192.168.68.63:3000`

Credentials are enabled for cross-origin requests.

---

## Request Size Limits

- Maximum request body size: **10MB**
- Suitable for base64 encoded images

---

## Best Practices

1. **Always include the Authorization header** for protected endpoints
2. **Use HTTPS in production** to secure data transmission
3. **Store JWT tokens securely** (e.g., httpOnly cookies or secure storage)
4. **Handle errors gracefully** on the client side
5. **Validate data** before sending requests
6. **Use appropriate HTTP methods** (GET, POST, PATCH, DELETE)
7. **Include proper Content-Type headers** (`application/json`)
