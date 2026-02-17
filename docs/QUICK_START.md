# Quick Start Guide

Get up and running with the E-commerce Backend API in 5 minutes!

## Prerequisites

- Node.js (v18+)
- PostgreSQL (v12+)
- npm or yarn

## Installation

### 1. Clone and Install

```bash
git clone <repository-url>
cd manajirOriginals-backend
npm install
```

### 2. Setup Database

```bash
# Create PostgreSQL database
createdb manajir_originals

# Or using psql
psql -U postgres
CREATE DATABASE manajir_originals;
\q
```

### 3. Configure Environment

Create `.env` file:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/manajir_originals"
JWT_SECRET="your-secret-key-change-in-production"
JWT_EXPIRATION="24h"
NODE_ENV="development"
PORT=5000
```

### 4. Setup Database Schema

```bash
# Generate Prisma Client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Seed database (optional)
npx prisma db seed
```

### 5. Start the Server

```bash
npm run start:dev
```

Server will start at `http://localhost:5000`

## Test the API

### 1. Sign Up

```bash
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test1234"
  }'
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "test@example.com",
    "role": "CUSTOMER"
  }
}
```

Save the `access_token` for authenticated requests.

### 2. Get Products

```bash
curl http://localhost:5000/api/products
```

### 3. Create Order (Authenticated)

```bash
curl -X POST http://localhost:5000/api/orders \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "variantId": 1,
        "quantity": 2
      }
    ],
    "paymentMethod": "CASH_ON_DELIVERY"
  }'
```

## Admin Access

If you seeded the database, use these credentials:

```
Email: admin@example.com
Password: Admin123
```

Login as admin:

```bash
curl -X POST http://localhost:5000/api/auth/admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "Admin123"
  }'
```

## Next Steps

- 📖 Read the [API Documentation](./API_DOCUMENTATION.md)
- 🔐 Learn about [Authentication](./AUTHENTICATION.md)
- 💾 Understand the [Database Schema](./DATABASE_SCHEMA.md)
- 💻 Check out [Usage Examples](./USAGE_EXAMPLES.md)
- 🛠️ Review the [Setup Guide](./SETUP_GUIDE.md) for detailed configuration

## Common Commands

```bash
# Development
npm run start:dev          # Start with hot-reload
npm run start:debug        # Start with debugging

# Database
npx prisma studio          # Open database GUI
npx prisma migrate dev     # Create migration
npx prisma db seed         # Seed database

# Testing
npm test                   # Run tests
npm run test:e2e           # Run E2E tests

# Code Quality
npm run format             # Format code
npm run lint               # Lint code
```

## Troubleshooting

### Database Connection Error

```bash
# Check PostgreSQL is running
pg_ctl status

# Verify DATABASE_URL in .env
```

### Port Already in Use

```bash
# Change PORT in .env or kill process
# Windows
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:5000 | xargs kill -9
```

### Prisma Client Error

```bash
npx prisma generate
```

## Need Help?

- Check [Troubleshooting Guide](./SETUP_GUIDE.md#troubleshooting)
- Review [Documentation](./API_DOCUMENTATION.md)
- Open an issue on GitHub

---

**You're all set! 🎉**
