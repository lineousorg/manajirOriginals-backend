# Setup Guide

This guide will walk you through setting up the E-commerce Backend API on your local machine.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Database Setup](#database-setup)
- [Environment Configuration](#environment-configuration)
- [Running the Application](#running-the-application)
- [Testing](#testing)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you begin, ensure you have the following installed on your system:

### Required Software

1. **Node.js** (v18 or higher)
   - Download from [nodejs.org](https://nodejs.org/)
   - Verify installation:
     ```bash
     node --version
     npm --version
     ```

2. **PostgreSQL** (v12 or higher)
   - Download from [postgresql.org](https://www.postgresql.org/download/)
   - Verify installation:
     ```bash
     psql --version
     ```

3. **Git**
   - Download from [git-scm.com](https://git-scm.com/)
   - Verify installation:
     ```bash
     git --version
     ```

### Optional Tools

- **Postman** or **Insomnia** - For API testing
- **pgAdmin** or **DBeaver** - For database management
- **VS Code** - Recommended code editor

---

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd manajirOriginals-backend
```

### 2. Install Dependencies

```bash
npm install
```

This will install all required packages including:
- NestJS framework
- Prisma ORM
- JWT authentication
- Validation libraries
- Testing frameworks

### 3. Verify Installation

```bash
npm list --depth=0
```

You should see all dependencies listed without errors.

---

## Database Setup

### 1. Create PostgreSQL Database

#### Option A: Using psql Command Line

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE manajir_originals;

# Create user (optional)
CREATE USER manajir_user WITH PASSWORD 'your_password';

# Grant privileges
GRANT ALL PRIVILEGES ON DATABASE manajir_originals TO manajir_user;

# Exit psql
\q
```

#### Option B: Using pgAdmin

1. Open pgAdmin
2. Right-click on "Databases"
3. Select "Create" > "Database"
4. Enter database name: `manajir_originals`
5. Click "Save"

### 2. Configure Database Connection

Create a `.env` file in the project root (see [Environment Configuration](#environment-configuration) section).

### 3. Generate Prisma Client

```bash
npx prisma generate
```

This generates the Prisma Client based on your schema.

### 4. Run Database Migrations

```bash
npx prisma migrate dev
```

This will:
- Create all database tables
- Set up relationships
- Apply indexes and constraints

### 5. Seed the Database (Optional)

```bash
npx prisma db seed
```

This creates sample data including:
- Admin user: `admin@example.com` / `Admin123`
- Sample categories
- Sample products with variants
- Sample attributes

---

## Environment Configuration

### 1. Create Environment File

Create a `.env` file in the project root:

```bash
touch .env
```

### 2. Add Environment Variables

Copy and paste the following into your `.env` file:

```env
# Database Configuration
DATABASE_URL="postgresql://postgres:password@localhost:5432/manajir_originals"

# JWT Configuration
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
JWT_EXPIRATION="24h"

# Application Configuration
NODE_ENV="development"
PORT=5000

# CORS Configuration (optional)
CORS_ORIGIN="http://localhost:3000"
```

### 3. Update Configuration Values

**Important:** Update the following values:

#### Database URL
```env
DATABASE_URL="postgresql://[username]:[password]@[host]:[port]/[database]"
```

Example:
```env
DATABASE_URL="postgresql://manajir_user:mypassword@localhost:5432/manajir_originals"
```

#### JWT Secret
Generate a secure random string for production:
```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Replace `your-super-secret-jwt-key-change-this-in-production` with the generated string.

### 4. Environment Variables Explained

| Variable       | Description                                    | Default          |
|----------------|------------------------------------------------|------------------|
| DATABASE_URL   | PostgreSQL connection string                   | Required         |
| JWT_SECRET     | Secret key for JWT token signing               | Required         |
| JWT_EXPIRATION | Token expiration time (e.g., "24h", "7d")      | "24h"            |
| NODE_ENV       | Environment mode (development/production)      | "development"    |
| PORT           | Server port number                             | 5000             |
| CORS_ORIGIN    | Allowed CORS origins (comma-separated)         | localhost:3000   |

---

## Running the Application

### Development Mode

Start the server with hot-reload (recommended for development):

```bash
npm run start:dev
```

The server will start on `http://localhost:5000`

You should see output like:
```
[Nest] 12345  - 02/17/2026, 12:00:00 PM     LOG [NestFactory] Starting Nest application...
[Nest] 12345  - 02/17/2026, 12:00:00 PM     LOG [InstanceLoader] AppModule dependencies initialized
[Nest] 12345  - 02/17/2026, 12:00:00 PM     LOG [NestApplication] Nest application successfully started
```

### Debug Mode

Start with debugging enabled:

```bash
npm run start:debug
```

Then attach your debugger to port 9229.

### Production Mode

Build and run for production:

```bash
# Build the application
npm run build

# Start production server
npm run start:prod
```

### Verify Server is Running

Open your browser or use curl:

```bash
curl http://localhost:5000/api
```

You should receive a response from the API.

---

## Testing

### Run All Tests

```bash
npm test
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

### Run E2E Tests

```bash
npm run test:e2e
```

### Generate Test Coverage Report

```bash
npm run test:cov
```

Coverage report will be generated in the `coverage/` directory.

---

## Verifying the Setup

### 1. Check Database Connection

```bash
npx prisma studio
```

This opens Prisma Studio at `http://localhost:5555` where you can view and edit database records.

### 2. Test API Endpoints

#### Sign Up
```bash
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test1234"
  }'
```

#### Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test1234"
  }'
```

#### Get Products
```bash
curl http://localhost:5000/api/products
```

### 3. Check Logs

Monitor the console output for any errors or warnings.

---

## Development Tools

### Prisma Studio

Visual database browser:

```bash
npx prisma studio
```

### Database Migrations

```bash
# Create a new migration
npx prisma migrate dev --name add_new_field

# Apply migrations
npx prisma migrate deploy

# Reset database (WARNING: deletes all data)
npx prisma migrate reset
```

### Code Formatting

```bash
# Format code
npm run format

# Lint code
npm run lint
```

---

## Deployment

### Preparing for Production

1. **Set Environment Variables**
   ```env
   NODE_ENV="production"
   DATABASE_URL="your-production-database-url"
   JWT_SECRET="your-production-jwt-secret"
   ```

2. **Build the Application**
   ```bash
   npm run build
   ```

3. **Run Migrations**
   ```bash
   npx prisma migrate deploy
   ```

4. **Start the Server**
   ```bash
   npm run start:prod
   ```

### Deployment Platforms

#### Heroku

```bash
# Install Heroku CLI
npm install -g heroku

# Login to Heroku
heroku login

# Create app
heroku create your-app-name

# Add PostgreSQL
heroku addons:create heroku-postgresql:hobby-dev

# Set environment variables
heroku config:set JWT_SECRET="your-secret"
heroku config:set NODE_ENV="production"

# Deploy
git push heroku main

# Run migrations
heroku run npx prisma migrate deploy
```

#### Railway

1. Connect your GitHub repository
2. Add PostgreSQL database
3. Set environment variables
4. Deploy automatically on push

#### DigitalOcean App Platform

1. Create new app from GitHub
2. Add managed PostgreSQL database
3. Configure environment variables
4. Deploy

#### AWS EC2

1. Launch EC2 instance
2. Install Node.js and PostgreSQL
3. Clone repository
4. Set up environment variables
5. Use PM2 for process management:
   ```bash
   npm install -g pm2
   pm2 start dist/main.js --name api
   pm2 startup
   pm2 save
   ```

---

## Troubleshooting

### Common Issues

#### 1. Database Connection Error

**Error:** `Can't reach database server`

**Solutions:**
- Verify PostgreSQL is running:
  ```bash
  # Windows
  pg_ctl status
  
  # Linux/Mac
  sudo service postgresql status
  ```
- Check DATABASE_URL in `.env`
- Verify database exists
- Check firewall settings

#### 2. Port Already in Use

**Error:** `Port 5000 is already in use`

**Solutions:**
- Change PORT in `.env`
- Kill process using the port:
  ```bash
  # Windows
  netstat -ano | findstr :5000
  taskkill /PID <PID> /F
  
  # Linux/Mac
  lsof -ti:5000 | xargs kill -9
  ```

#### 3. Prisma Client Not Generated

**Error:** `Cannot find module '@prisma/client'`

**Solution:**
```bash
npx prisma generate
```

#### 4. Migration Errors

**Error:** `Migration failed`

**Solutions:**
- Check database connection
- Reset database (development only):
  ```bash
  npx prisma migrate reset
  ```
- Manually fix conflicts in database

#### 5. JWT Token Errors

**Error:** `Unauthorized` or `Invalid token`

**Solutions:**
- Verify JWT_SECRET is set in `.env`
- Check token expiration
- Ensure token is included in Authorization header:
  ```
  Authorization: Bearer <token>
  ```

#### 6. CORS Errors

**Error:** `CORS policy: No 'Access-Control-Allow-Origin' header`

**Solution:**
Update CORS configuration in `src/main.ts`:
```typescript
app.enableCors({
  origin: ['http://localhost:3000', 'https://your-frontend.com'],
  credentials: true,
});
```

#### 7. Validation Errors

**Error:** `Bad Request` with validation messages

**Solution:**
- Check request body matches DTO requirements
- Ensure all required fields are provided
- Verify data types match expectations

---

## Next Steps

After successful setup:

1. **Read the API Documentation** - See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)
2. **Understand the Database Schema** - See [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)
3. **Review Authentication** - See [AUTHENTICATION.md](./AUTHENTICATION.md)
4. **Explore the Code** - Start with `src/main.ts` and module files

---

## Getting Help

If you encounter issues not covered in this guide:

1. Check the [Troubleshooting](#troubleshooting) section
2. Review NestJS documentation: https://docs.nestjs.com
3. Review Prisma documentation: https://www.prisma.io/docs
4. Check project issues on GitHub
5. Contact the development team

---

## Useful Commands Reference

```bash
# Development
npm run start:dev          # Start with hot-reload
npm run start:debug        # Start with debugging

# Building
npm run build              # Build for production
npm run start:prod         # Run production build

# Testing
npm test                   # Run unit tests
npm run test:watch         # Run tests in watch mode
npm run test:e2e           # Run E2E tests
npm run test:cov           # Generate coverage report

# Database
npx prisma studio          # Open database GUI
npx prisma generate        # Generate Prisma Client
npx prisma migrate dev     # Create and apply migration
npx prisma migrate deploy  # Apply migrations (production)
npx prisma migrate reset   # Reset database
npx prisma db seed         # Seed database

# Code Quality
npm run format             # Format code with Prettier
npm run lint               # Lint code with ESLint
```

---

## System Requirements

### Minimum Requirements
- **CPU:** 2 cores
- **RAM:** 2 GB
- **Storage:** 1 GB free space
- **OS:** Windows 10, macOS 10.15+, or Linux

### Recommended Requirements
- **CPU:** 4 cores
- **RAM:** 4 GB
- **Storage:** 5 GB free space
- **OS:** Latest stable version

---

## License

This project is licensed under UNLICENSED.
