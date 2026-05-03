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
- [Stock Reservations](#stock-reservations)
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
  "message": "User created successfully",
  "status": "success",
  "data": {
    "id": 1,
    "email": "user@example.com",
    "role": "CUSTOMER",
    "createdAt": "2026-03-31T20:08:35.000Z",
    "updatedAt": "2026-03-31T20:08:35.000Z"
  }
}
```

**Error Responses:**
- `400`: Invalid email or password format
- `409`: Email already exists

### Sign In
Authenticate and receive JWT token.

**Endpoint:** `POST /api/auth/signin`

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
  "message": "Login successful",
  "status": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "email": "user@example.com",
      "role": "CUSTOMER"
    }
  }
}
```

**Error Responses:**
- `401`: Invalid credentials
- `404`: User not found

---

## Stock Reservations

Stock reservation prevents overselling by reserving stock when users add items to their cart. Reservations expire after 15 minutes (configurable) and are automatically released by a scheduled cron job running every 5 minutes.

### Get Guest Token
Generate or retrieve guest token for anonymous session tracking. Required for guest users to reserve and release stock.

**Endpoint:** `GET /api/stock-reservation/guest-token`

**Access:** Public

**Response:**
```json
{
  "guestToken": "a1b2c3d4e5f6789012345678901234567"
}
```

**Notes:**
- Token is set as HTTP-only cookie (7 days)
- Also returned in response body for localStorage storage
- Include this token in all reservation requests for guest users

### Reserve Stock
Reserve stock for a variant. Works for both authenticated users and guest users.

**Endpoint:** `POST /api/stock-reservation/reserve`

**Access:** Public

**Request Body:**
```json
{
  "variantId": 123,
  "quantity": 2,
  "expirationMinutes": 15,
  "guestToken": "a1b2c3d4e5f6789012345678901234567"
}
```

**Fields:**
- `variantId` (required): Product variant ID
- `quantity` (required): Number of items to reserve
- `expirationMinutes` (optional): Reservation duration (default: 15)
- `guestToken` (optional): Required for guest users

**Success Response (200):**
```json
{
  "message": "Stock reserved successfully",
  "status": "success",
  "data": {
    "reservationId": 456,
    "variantId": 123,
    "quantity": 2,
    "expiresAt": "2026-03-31T20:23:35.000Z",
    "availableStock": 8
  }
}
```

**Error Responses:**
- `400`: Invalid quantity or missing guest token for anonymous users
- `404`: Variant not found
- `409`: Insufficient stock (e.g., "Only 1 items available. You requested 2.")

### Release Reservation
Release a reservation when user removes item from cart. Works for both authenticated users and guest users.

**Endpoint:** `POST /api/stock-reservation/release`

**Access:** Public

**Request Body (Authenticated User):**
```json
{
  "reservationId": 456
}
```

**Request Body (Guest User):**
```json
{
  "reservationId": 456,
  "guestToken": "a1b2c3d4e5f6789012345678901234567"
}
```

**Fields:**
- `reservationId` (required): Reservation ID to release
- `guestToken` (optional): Required for guest users

**Success Response (200):**
```json
{
  "message": "Reservation released successfully",
  "status": "success",
  "data": {
    "reservationId": 456,
    "restoredStock": 2
  }
}
```

**Idempotent Behavior:**
If reservation is already released, returns success:
```json
{
  "message": "Reservation already released",
  "status": "success",
  "data": {
    "reservationId": 456,
    "restoredStock": 2
  }
}
```

**Error Responses:**
- `400`: Missing authentication or guest token
- `404`: Reservation not found or already processed

### Get My Reservations
Get all active reservations for the current user.

**Endpoint:** `GET /api/stock-reservation/my-reservations`

**Access:** Public

**Query Parameters:**
- `guestToken` (optional): Required for guest users

**Success Response (200):**
```json
{
  "message": "Active reservations retrieved",
  "status": "success",
  "data": [
    {
      "id": 456,
      "userId": 1,
      "variantId": 123,
      "quantity": 2,
      "status": "ACTIVE",
      "expiresAt": "2026-03-31T20:23:35.000Z",
      "createdAt": "2026-03-31T20:08:35.000Z",
      "variant": {
        "id": 123,
        "sku": "SKU-123456",
        "price": 1500.00,
        "product": {
          "id": 100,
          "name": "Classic T-Shirt",
          "slug": "classic-t-shirt"
        }
      }
    }
  ]
}
```

### Get Available Stock
Get available stock for a specific variant (considers active reservations).

**Endpoint:** `GET /api/stock-reservation/available/:variantId`

**Access:** Public

**Success Response (200):**
```json
{
  "message": "Available stock retrieved",
  "status": "success",
  "data": {
    "variantId": 123,
    "totalStock": 10,
    "reservedStock": 2,
    "availableStock": 8
  }
}
```

**Error Responses:**
- `404`: Variant not found

### Check Availability
Check if stock is available for a given quantity.

**Endpoint:** `POST /api/stock-reservation/check`

**Access:** Public

**Request Body:**
```json
{
  "variantId": 123,
  "quantity": 2
}
```

**Success Response (200):**
```json
{
  "available": true,
  "message": "Stock available",
  "availableStock": 8
}
```

**Error Responses:**
- `404`: Variant not found

### Release Expired Reservations
Release all expired reservations (admin/cron endpoint).

**Endpoint:** `POST /api/stock-reservation/release-expired`

**Access:** Public (typically called by cron job)

**Success Response (200):**
```json
{
  "message": "Released 5 expired reservations and restored stock",
  "status": "success",
  "data": {
    "totalFound": 5,
    "restored": 5,
    "skipped": 0,
    "skippedReservationIds": []
  }
}
```

### Get Reservation by ID
Get reservation details by ID.

**Endpoint:** `GET /api/stock-reservation/:id`

**Access:** Requires Authentication (Customer)

**Success Response (200):**
```json
{
  "message": "Reservation retrieved",
  "status": "success",
  "data": {
    "id": 456,
    "userId": 1,
    "variantId": 123,
    "quantity": 2,
    "status": "ACTIVE",
    "expiresAt": "2026-03-31T20:23:35.000Z",
    "createdAt": "2026-03-31T20:08:35.000Z",
    "variant": {
      "id": 123,
      "sku": "SKU-123456",
      "price": 1500.00,
      "product": {
        "id": 100,
        "name": "Classic T-Shirt",
        "slug": "classic-t-shirt"
      }
    }
  }
}
```

**Error Responses:**
- `401`: Not authenticated
- `404`: Reservation not found

### Force Clean Reservations
Force clean ALL active reservations (admin emergency endpoint).

**Endpoint:** `POST /api/stock-reservation/force-clean`

**Access:** Requires Authentication (Admin)

**Success Response (200):**
```json
{
  "message": "Force cleaned 10 active reservations and restored stock",
  "status": "success",
  "data": {
    "totalFound": 10,
    "restored": 10,
    "skipped": 0,
    "skippedReservationIds": []
  }
}
```

**Error Responses:**
- `401`: Not authenticated
- `403`: Not authorized (not admin)

---

## Error Handling

All error responses follow this format:

```json
{
  "statusCode": 404,
  "message": "Reservation not found",
  "error": "Not Found"
}
```

### Common Error Codes

| Code | Description |
|------|-------------|
| `400` | Bad Request - Invalid input or missing parameters |
| `401` | Unauthorized - Authentication required |
| `403` | Forbidden - Insufficient permissions |
| `404` | Not Found - Resource doesn't exist |
| `409` | Conflict - Insufficient stock or duplicate reservation |
| `500` | Internal Server Error - Server-side error |
