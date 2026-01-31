# Fashion CMS Backend

A modern e-commerce Content Management System backend built with **NestJS** and **TypeScript**. This API provides comprehensive features for managing products, categories, variants, orders, and user authentication for a fashion retail platform.

## Features

- **User Management** - Role-based access control (Admin/User)
- **Product Management** - Create, update, and manage fashion products with detailed descriptions
- **Product Variants** - Support for multiple sizes, colors, and pricing per product
- **Categories** - Organize products into categories
- **Order Management** - Track orders with status workflow (Pending > Confirmed > Shipped > Delivered)
- **Authentication** - JWT-based authentication with Passport.js
- **Database** - PostgreSQL with Prisma ORM for type-safe database access
- **Validation** - Input validation with class-validator
- **Testing** - Unit tests and E2E tests with Jest

## Tech Stack

- **Runtime**: Node.js
- **Framework**: NestJS 11.x
- **Language**: TypeScript
- **Database**: PostgreSQL with Prisma
- **Authentication**: JWT + Passport.js
- **Validation**: class-validator & class-transformer
- **Password Hashing**: bcrypt
- **Testing**: Jest
- **Code Quality**: ESLint & Prettier

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher)
- **npm** or **yarn**
- **PostgreSQL** (v12 or higher)
- **Git**

## Installation & Setup

### 1. Clone the Repository

\\\ash
git clone <repository-url>
cd fashion_cms
\\\

### 2. Install Dependencies

\\\ash
npm install
\\\

### 3. Configure Environment Variables

Create a \.env\ file in the root directory with the following variables:

\\\env
# Database Configuration
DATABASE_URL="postgresql://user:password@localhost:5432/fashion_cms"

# JWT Configuration
JWT_SECRET="your-secret-key-here"
JWT_EXPIRATION="24h"

# Application
NODE_ENV="development"
PORT=3000
\\\

Replace the database credentials with your PostgreSQL setup.

### 4. Setup Database

Run Prisma migrations to create the database schema:

\\\ash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# (Optional) Seed the database with sample data
npx prisma db seed
\\\

## Running the Application

### Development Mode (with auto-reload)

\\\ash
npm run start:dev
\\\

The server will start on \http://localhost:3000\

### Debug Mode

\\\ash
npm run start:debug
\\\

### Production Mode

\\\ash
npm run build
npm run start:prod
\\\

## Testing

### Unit Tests

\\\ash
npm run test
\\\

### Unit Tests (Watch Mode)

\\\ash
npm run test:watch
\\\

### E2E Tests

\\\ash
npm run test:e2e
\\\

### Test Coverage

\\\ash
npm run test:cov
\\\

## Code Quality

### Run Linter

\\\ash
npm run lint
\\\

### Format Code

\\\ash
npm run format
\\\

## Project Structure

\\\
src/
├── auth/               # Authentication & Authorization
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── jwt.strategy.ts
│   ├── jwt-auth.guard.ts
│   └── roles.guard.ts
├── product/           # Product Management
│   ├── product.controller.ts
│   ├── product.service.ts
│   └── dto/
├── prisma/            # Database Service
│   └── prisma.service.ts
├── app.module.ts      # Root Module
├── app.controller.ts
├── app.service.ts
└── main.ts            # Application Entry Point

prisma/
├── schema.prisma      # Database Schema
├── seed.ts            # Database Seeding
└── migrations/        # Database Migrations
\\\

## Database Schema

### User
- \id\ (UUID): Unique identifier
- \email\ (String): Unique email
- \password\ (String): Hashed password
- \
ole\ (Enum): ADMIN or USER
- \isActive\ (Boolean): Account status
- \createdAt\ (DateTime): Creation timestamp
- \updatedAt\ (DateTime): Last update timestamp

### Product
- \id\ (Int): Unique identifier
- \
ame\ (String): Product name
- \description\ (String): Product description
- \price\ (Float): Base price
- \isFeatured\ (Boolean): Featured product flag
- \isBest\ (Boolean): Best seller flag
- \isActive\ (Boolean): Product status
- \categoryId\ (Int): Category reference
- \ariants\ (Relation): Product variants

### Product Variant
- \id\ (Int): Unique identifier
- \size\ (String): Size option
- \color\ (String): Color option
- \price\ (Float): Variant-specific price
- \stock\ (Int): Available quantity
- \productId\ (Int): Product reference

### Order
- \id\ (Int): Unique identifier
- \status\ (Enum): PENDING, CONFIRMED, SHIPPED, DELIVERED, CANCELLED, REFUNDED
- \	otal\ (Float): Order total
- \userId\ (String): User reference
- \createdAt\ (DateTime): Order creation time

### Category
- \id\ (Int): Unique identifier
- \
ame\ (String): Category name
- \isActive\ (Boolean): Category status

## Authentication

The API uses JWT (JSON Web Tokens) for authentication.

### Login Flow

1. Send credentials to \/auth/login\
2. Receive JWT token in response
3. Include token in \Authorization\ header: \Bearer <token>\

### Protected Routes

Routes requiring authentication are protected by the \JwtAuthGuard\. Admin-only routes require the \ADMIN\ role.

## API Endpoints

### Authentication
- \POST /auth/login\ - User login
- \POST /auth/signup\ - User registration

### Products
- \GET /product\ - Get all products
- \GET /product/:id\ - Get product by ID
- \POST /product\ - Create product (Admin only)
- \PATCH /product/:id\ - Update product (Admin only)
- \DELETE /product/:id\ - Delete product (Admin only)

### Orders
- \GET /orders\ - Get user orders
- \POST /orders\ - Create order

## Troubleshooting

### Database Connection Error
- Ensure PostgreSQL is running
- Verify \DATABASE_URL\ in \.env\ is correct
- Check PostgreSQL credentials

### Port Already in Use
- Change \PORT\ in \.env\
- Or kill the process using port 3000

### Prisma Client Errors
\\\ash
npx prisma generate
npx prisma migrate dev
\\\

## Additional Resources

- [NestJS Documentation](https://docs.nestjs.com)
- [Prisma Documentation](https://www.prisma.io/docs)
- [JWT Authentication Guide](https://docs.nestjs.com/security/authentication)
- [Role-Based Access Control](https://docs.nestjs.com/security/authorization)

## License

This project is licensed under the UNLICENSED license.
