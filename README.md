# Manajir Originals E-commerce Backend

A comprehensive e-commerce backend API built with **NestJS** and **TypeScript**. This API provides complete features for managing products with variants, categories, orders, user authentication, and address management for an online retail platform.

## 🚀 Features

- **🔐 Authentication & Authorization** - JWT-based authentication with role-based access control (Admin/Customer)
- **👥 User Management** - Complete user profile management with role-based permissions
- **📦 Product Management** - Advanced product system with variants, attributes, and images
- **🏷️ Category System** - Hierarchical category structure for product organization
- **🛒 Order Management** - Full order lifecycle with status tracking and payment methods
- **📍 Address Management** - Multiple shipping addresses with default address support
- **🔍 Product Variants** - Support for multiple sizes, colors, and other attributes per product
- **💾 Database** - PostgreSQL with Prisma ORM for type-safe database access
- **✅ Validation** - Comprehensive input validation with class-validator
- **🧪 Testing** - Unit tests and E2E tests with Jest
- **📝 API Documentation** - Complete API documentation with examples

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

## 📚 Documentation

Comprehensive documentation is available in the [`docs/`](docs/) directory:

- **[Setup Guide](docs/SETUP_GUIDE.md)** - Complete installation and setup instructions
- **[API Documentation](docs/API_DOCUMENTATION.md)** - Detailed API endpoints with request/response examples
- **[Database Schema](docs/DATABASE_SCHEMA.md)** - Database structure and relationships
- **[Authentication](docs/AUTHENTICATION.md)** - Authentication and authorization guide
- **[Usage Examples](docs/USAGE_EXAMPLES.md)** - Practical code examples and workflows

## 📁 Project Structure

```
src/
├── auth/               # Authentication & Authorization
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── jwt.strategy.ts
│   ├── jwt-auth.guard.ts
│   ├── roles.guard.ts
│   └── dto/
├── user/              # User Management
│   ├── user.controller.ts
│   ├── user.service.ts
│   └── dto/
├── product/           # Product Management
│   ├── product.controller.ts
│   ├── product.service.ts
│   └── dto/
├── category/          # Category Management
│   ├── category.controller.ts
│   ├── category.service.ts
│   └── dto/
├── order/             # Order Management
│   ├── order.controller.ts
│   ├── order.service.ts
│   └── dto/
├── address/           # Address Management
│   ├── address.controller.ts
│   ├── address.service.ts
│   └── dto/
├── prisma/            # Database Service
│   └── prisma.service.ts
├── app.module.ts      # Root Module
└── main.ts            # Application Entry Point

prisma/
├── schema.prisma      # Database Schema
├── seed.ts            # Database Seeding
└── migrations/        # Database Migrations

docs/
├── API_DOCUMENTATION.md    # API Reference
├── DATABASE_SCHEMA.md      # Database Documentation
├── SETUP_GUIDE.md          # Setup Instructions
├── AUTHENTICATION.md       # Auth Guide
└── USAGE_EXAMPLES.md       # Code Examples
```

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

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/signup` - User registration
- `POST /api/auth/login` - Customer login
- `POST /api/auth/admin/login` - Admin login

### Users
- `GET /api/users` - Get all users (Admin only)
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create user (Admin only)
- `PATCH /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user (Admin only)

### Products
- `GET /api/products` - Get all products
- `GET /api/products/:id` - Get product by ID
- `POST /api/products` - Create product (Admin only)
- `PATCH /api/products/:id` - Update product (Admin only)
- `DELETE /api/products/:id` - Delete product (Admin only)

### Categories
- `GET /api/categories` - Get all categories
- `GET /api/categories/:id` - Get category by ID
- `POST /api/categories` - Create category (Admin only)
- `DELETE /api/categories/:id` - Delete category (Admin only)

### Orders
- `GET /api/orders` - Get orders (all for admin, own for customers)
- `GET /api/orders/:id` - Get order by ID
- `POST /api/orders` - Create order
- `PATCH /api/orders/:id/status` - Update order status (Admin only)

### Addresses
- `GET /api/addresses` - Get user addresses
- `GET /api/addresses/:id` - Get address by ID
- `POST /api/addresses` - Create address
- `PATCH /api/addresses/:id` - Update address
- `DELETE /api/addresses/:id` - Delete address
- `PATCH /api/addresses/:id/set-default` - Set default address

For detailed API documentation with request/response examples, see [API Documentation](docs/API_DOCUMENTATION.md).

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

## 📖 Additional Resources

- [NestJS Documentation](https://docs.nestjs.com)
- [Prisma Documentation](https://www.prisma.io/docs)
- [JWT Authentication Guide](https://docs.nestjs.com/security/authentication)
- [Role-Based Access Control](https://docs.nestjs.com/security/authorization)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the UNLICENSED license.

## 👨‍💻 Support

For support and questions:
- Check the [documentation](docs/)
- Review [troubleshooting guide](docs/SETUP_GUIDE.md#troubleshooting)
- Open an issue on GitHub

---

**Built with ❤️ using NestJS and TypeScript**
