import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import * as dotenv from 'dotenv';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Swagger Configuration
  const config = new DocumentBuilder()
    .setTitle('Manajir Originals API')
    .setDescription('API documentation for Manajir Originals backend')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('Auth', 'Authentication endpoints')
    .addTag('Products', 'Product management endpoints')
    .addTag('Categories', 'Category management endpoints')
    .addTag('Users', 'User management endpoints')
    .addTag('Orders', 'Order management endpoints')
    .addTag('Addresses', 'Address management endpoints')
    .addTag('Attributes', 'Attribute management endpoints')
    .addTag('Attribute Values', 'Attribute value management endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    extraModels: [],
  });
  
  // Set the base path for Swagger
  document.servers = [{ url: '/api' }];
  
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
    customCss: `
      .swagger-ui .topbar { display: none }
      .swagger-ui .auth-wrapper { display: none }
    `,
    customSiteTitle: 'Manajir Originals API Docs',
  });

  // Add global /api prefix
  app.setGlobalPrefix('api');
  // Increase body size limit for file uploads (default is 100kb)
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // ✅ ADD THIS
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      forbidNonWhitelisted: true,
    }),
  );

  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://192.168.68.63:3000',
      'https://dashboard.manajiroriginals.com',
      'https://manajiroriginals.com'
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  await app.listen(5000, '0.0.0.0');
}
bootstrap();
