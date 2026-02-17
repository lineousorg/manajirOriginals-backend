# Authentication & Authorization

This document explains the authentication and authorization system used in the E-commerce Backend API.

## Table of Contents
- [Overview](#overview)
- [Authentication Flow](#authentication-flow)
- [JWT Tokens](#jwt-tokens)
- [Role-Based Access Control](#role-based-access-control)
- [Implementation Details](#implementation-details)
- [Security Best Practices](#security-best-practices)
- [Code Examples](#code-examples)

---

## Overview

The API uses **JWT (JSON Web Tokens)** for authentication and **Role-Based Access Control (RBAC)** for authorization.

### Key Features

- **Stateless Authentication** - No server-side session storage required
- **Role-Based Access** - Two roles: ADMIN and CUSTOMER
- **Secure Password Storage** - Passwords hashed with bcrypt
- **Token Expiration** - Configurable token lifetime
- **Protected Routes** - Guards prevent unauthorized access

### Technology Stack

- **Passport.js** - Authentication middleware
- **JWT Strategy** - Token-based authentication
- **bcrypt** - Password hashing
- **class-validator** - Input validation

---

## Authentication Flow

### 1. User Registration (Sign Up)

```
Client                          Server                      Database
  |                               |                             |
  |-- POST /api/auth/signup ----->|                             |
  |   { email, password }         |                             |
  |                               |-- Validate input            |
  |                               |-- Check email exists ------>|
  |                               |<-- Email available ---------|
  |                               |-- Hash password             |
  |                               |-- Create user ------------->|
  |                               |<-- User created ------------|
  |                               |-- Generate JWT token        |
  |<-- { token, user } -----------|                             |
```

**Steps:**
1. Client sends email and password
2. Server validates input (email format, password strength)
3. Server checks if email already exists
4. Server hashes password using bcrypt
5. Server creates user in database
6. Server generates JWT token
7. Server returns token and user data

### 2. User Login

```
Client                          Server                      Database
  |                               |                             |
  |-- POST /api/auth/login ------>|                             |
  |   { email, password }         |                             |
  |                               |-- Find user by email ------>|
  |                               |<-- User data ---------------|
  |                               |-- Compare passwords         |
  |                               |-- Generate JWT token        |
  |<-- { token, user } -----------|                             |
```

**Steps:**
1. Client sends email and password
2. Server finds user by email
3. Server compares password with hashed password
4. Server generates JWT token
5. Server returns token and user data

### 3. Accessing Protected Routes

```
Client                          Server                      Database
  |                               |                             |
  |-- GET /api/users ------------>|                             |
  |   Authorization: Bearer token |                             |
  |                               |-- Verify JWT token          |
  |                               |-- Extract user info         |
  |                               |-- Check permissions         |
  |                               |-- Process request --------->|
  |                               |<-- Data -------------------|
  |<-- Response ------------------|                             |
```

**Steps:**
1. Client includes JWT token in Authorization header
2. Server verifies token signature
3. Server extracts user information from token
4. Server checks user permissions
5. Server processes request if authorized
6. Server returns response

---

## JWT Tokens

### Token Structure

A JWT token consists of three parts separated by dots:

```
header.payload.signature
```

Example:
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiZW1haWwiOiJ1c2VyQGV4YW1wbGUuY29tIiwicm9sZSI6IkNVU1RPTUVSIiwiaWF0IjoxNjQ1MjAwMDAwLCJleHAiOjE2NDUyODY0MDB9.signature
```

### Token Payload

The token contains the following information:

```json
{
  "id": 1,
  "email": "user@example.com",
  "role": "CUSTOMER",
  "iat": 1645200000,
  "exp": 1645286400
}
```

| Field | Description                          |
|-------|--------------------------------------|
| id    | User's unique identifier             |
| email | User's email address                 |
| role  | User's role (ADMIN or CUSTOMER)      |
| iat   | Issued at timestamp                  |
| exp   | Expiration timestamp                 |

### Token Configuration

Configure in `.env`:

```env
JWT_SECRET="your-secret-key"
JWT_EXPIRATION="24h"
```

**Expiration Formats:**
- `"60s"` - 60 seconds
- `"5m"` - 5 minutes
- `"2h"` - 2 hours
- `"7d"` - 7 days
- `"30d"` - 30 days

### Using Tokens

Include the token in the Authorization header:

```http
GET /api/users HTTP/1.1
Host: localhost:5000
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
```

---

## Role-Based Access Control

### Roles

The system supports two roles:

#### ADMIN
- Full system access
- Can manage all users
- Can create/update/delete products
- Can manage categories
- Can view and update all orders
- Can access admin-only endpoints

#### CUSTOMER
- Limited access
- Can view own profile
- Can update own profile
- Can create orders
- Can view own orders
- Can manage own addresses

### Access Control Matrix

| Endpoint                    | Public | Customer | Admin |
|-----------------------------|--------|----------|-------|
| POST /auth/signup           | ✓      | ✓        | ✓     |
| POST /auth/login            | ✓      | ✓        | ✓     |
| POST /auth/admin/login      | ✓      | ✗        | ✓     |
| GET /products               | ✓      | ✓        | ✓     |
| GET /products/:id           | ✓      | ✓        | ✓     |
| POST /products              | ✗      | ✗        | ✓     |
| PATCH /products/:id         | ✗      | ✗        | ✓     |
| DELETE /products/:id        | ✗      | ✗        | ✓     |
| GET /categories             | ✓      | ✓        | ✓     |
| POST /categories            | ✗      | ✗        | ✓     |
| DELETE /categories/:id      | ✗      | ✗        | ✓     |
| GET /users                  | ✗      | ✗        | ✓     |
| GET /users/:id              | ✗      | ✓*       | ✓     |
| POST /users                 | ✗      | ✗        | ✓     |
| PATCH /users/:id            | ✗      | ✓*       | ✓     |
| DELETE /users/:id           | ✗      | ✗        | ✓     |
| GET /orders                 | ✗      | ✓*       | ✓     |
| GET /orders/:id             | ✗      | ✓*       | ✓     |
| POST /orders                | ✗      | ✓        | ✓     |
| PATCH /orders/:id/status    | ✗      | ✗        | ✓     |
| GET /addresses              | ✗      | ✓        | ✓     |
| POST /addresses             | ✗      | ✓        | ✓     |
| PATCH /addresses/:id        | ✗      | ✓*       | ✓     |
| DELETE /addresses/:id       | ✗      | ✓*       | ✓     |

**Legend:**
- ✓ = Allowed
- ✗ = Denied
- ✓* = Allowed (own resources only)

---

## Implementation Details

### Guards

The API uses two types of guards:

#### 1. JwtAuthGuard

Verifies JWT token and extracts user information.

**Usage:**
```typescript
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  // All routes require authentication
}
```

#### 2. RolesGuard

Checks if user has required role.

**Usage:**
```typescript
@Post()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
create(@Body() dto: CreateUserDto) {
  // Only admins can access
}
```

### Password Hashing

Passwords are hashed using bcrypt with a salt rounds of 10.

**Hashing:**
```typescript
import * as bcrypt from 'bcrypt';

const hashedPassword = await bcrypt.hash(password, 10);
```

**Verification:**
```typescript
const isValid = await bcrypt.compare(password, hashedPassword);
```

### JWT Strategy

The JWT strategy validates tokens and extracts user information.

**Configuration:**
```typescript
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: any) {
    return {
      id: payload.id,
      email: payload.email,
      role: payload.role,
    };
  }
}
```

---

## Security Best Practices

### 1. Password Requirements

Passwords must meet the following criteria:
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number

**Validation:**
```typescript
@IsString()
@MinLength(8)
@Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
  message: 'Password must contain uppercase, lowercase, and number',
})
password!: string;
```

### 2. Token Security

**Best Practices:**
- Use strong, random JWT_SECRET (minimum 32 characters)
- Set appropriate token expiration
- Store tokens securely on client (httpOnly cookies or secure storage)
- Never expose JWT_SECRET in client code
- Rotate secrets periodically in production

**Generate Secure Secret:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. HTTPS in Production

Always use HTTPS in production to prevent token interception:
- Tokens transmitted over HTTP can be intercepted
- Use SSL/TLS certificates
- Redirect HTTP to HTTPS

### 4. Token Refresh

Consider implementing token refresh for better security:
- Short-lived access tokens (15-30 minutes)
- Long-lived refresh tokens (7-30 days)
- Refresh tokens stored securely
- Ability to revoke refresh tokens

### 5. Rate Limiting

Implement rate limiting to prevent brute force attacks:
- Limit login attempts per IP
- Implement exponential backoff
- Use CAPTCHA after failed attempts

### 6. Input Validation

Always validate and sanitize user input:
- Use class-validator decorators
- Whitelist allowed properties
- Sanitize HTML/SQL inputs
- Validate email formats

---

## Code Examples

### Sign Up

```typescript
// Request
POST /api/auth/signup
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123"
}

// Response
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "role": "CUSTOMER"
  }
}
```

### Login

```typescript
// Request
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123"
}

// Response
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "role": "CUSTOMER"
  }
}
```

### Admin Login

```typescript
// Request
POST /api/auth/admin/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "AdminPass123"
}

// Response
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "admin@example.com",
    "role": "ADMIN"
  }
}
```

### Using Token in Requests

```typescript
// JavaScript/TypeScript
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';

fetch('http://localhost:5000/api/users', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
})
.then(response => response.json())
.then(data => console.log(data));
```

```bash
# cURL
curl -X GET http://localhost:5000/api/users \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json"
```

### Protecting Routes

```typescript
// Require authentication
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  @Get()
  findAll(@Request() req) {
    // req.user contains authenticated user info
    console.log(req.user); // { id, email, role }
  }
}

// Require specific role
@Post()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
create(@Body() dto: CreateUserDto) {
  // Only admins can access
}

// Multiple roles
@Get()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.CUSTOMER)
findAll() {
  // Both admins and customers can access
}
```

### Accessing User Info in Controllers

```typescript
@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrderController {
  @Post()
  create(@Request() req, @Body() dto: CreateOrderDto) {
    const userId = req.user.id;
    const userRole = req.user.role;
    
    // Use user info in business logic
    return this.orderService.create(userId, dto);
  }
}
```

### Custom Authorization Logic

```typescript
@Get(':id')
findOne(@Param('id') id: number, @Request() req) {
  const userId = req.user.id;
  const userRole = req.user.role;
  
  // Admins can view any user, customers only their own
  if (userRole !== 'ADMIN' && userId !== id) {
    throw new ForbiddenException('Access denied');
  }
  
  return this.userService.findOne(id);
}
```

---

## Error Handling

### Authentication Errors

**Invalid Credentials:**
```json
{
  "statusCode": 401,
  "message": "Invalid credentials"
}
```

**Missing Token:**
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

**Expired Token:**
```json
{
  "statusCode": 401,
  "message": "Token expired"
}
```

**Invalid Token:**
```json
{
  "statusCode": 401,
  "message": "Invalid token"
}
```

### Authorization Errors

**Insufficient Permissions:**
```json
{
  "statusCode": 403,
  "message": "Forbidden resource"
}
```

**Access Denied:**
```json
{
  "statusCode": 403,
  "message": "Access denied"
}
```

---

## Testing Authentication

### Using Postman

1. **Sign Up / Login**
   - Send POST request to `/api/auth/signup` or `/api/auth/login`
   - Copy the `access_token` from response

2. **Set Authorization**
   - Go to Authorization tab
   - Select "Bearer Token"
   - Paste the token

3. **Make Requests**
   - Token will be automatically included in requests

### Using cURL

```bash
# 1. Login and save token
TOKEN=$(curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"Pass123"}' \
  | jq -r '.access_token')

# 2. Use token in requests
curl -X GET http://localhost:5000/api/users \
  -H "Authorization: Bearer $TOKEN"
```

---

## Troubleshooting

### Token Not Working

1. Check token is included in Authorization header
2. Verify token format: `Bearer <token>`
3. Check token hasn't expired
4. Verify JWT_SECRET matches between sign and verify

### Permission Denied

1. Check user role in token payload
2. Verify route requires correct role
3. Check guards are properly applied
4. Ensure user has necessary permissions

### Password Validation Failing

1. Check password meets requirements
2. Verify validation decorators are applied
3. Check ValidationPipe is enabled globally

---

## Additional Resources

- [JWT.io](https://jwt.io/) - JWT debugger
- [Passport.js Documentation](http://www.passportjs.org/)
- [NestJS Authentication](https://docs.nestjs.com/security/authentication)
- [bcrypt Documentation](https://www.npmjs.com/package/bcrypt)
