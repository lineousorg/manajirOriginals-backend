/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { PrismaClient, Role, OrderStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  console.log(process.env.DATABASE_URL);


  // 1️⃣ Admin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@system.com' },
    update: {},
    create: {
      email: 'admin@system.com',
      password: adminPassword,
      role: Role.ADMIN,
    },
  });

  // 2️⃣ Normal users
  const userPassword = await bcrypt.hash('user123', 10);

  const user1 = await prisma.user.upsert({
    where: { email: 'user1@shop.com' },
    update: {},
    create: {
      email: 'user1@shop.com',
      password: userPassword,
      role: Role.USER,
    },
  });

  const user2 = await prisma.user.upsert({
    where: { email: 'user2@shop.com' },
    update: {},
    create: {
      email: 'user2@shop.com',
      password: userPassword,
      role: Role.USER,
    },
  });

  // 3️⃣ Categories
  const fashion = await prisma.category.upsert({
    where: { id: 2 },
    update: {},
    create: { name: 'Fashion' },
  });

  const tshirt = await prisma.product.create({
    data: {
      name: 'Cool T-Shirt',
      description: 'Cotton T-Shirt',
      price: 19.99,
      categoryId: fashion.id,
    },
  });

  const jeans = await prisma.product.create({
    data: {
      name: 'Blue Jeans',
      description: 'Slim fit denim jeans',
      price: 49.99,
      categoryId: fashion.id,
    },
  });

  // 5️⃣ Variants
  await prisma.variant.createMany({
    data: [
      // T-Shirt variants
      {
        size: 'M',
        color: 'Black',
        price: 19.99,
        stock: 50,
        productId: tshirt.id,
      },
      {
        size: 'L',
        color: 'White',
        price: 19.99,
        stock: 30,
        productId: tshirt.id,
      },

      // Jeans variants
      {
        size: '32',
        color: 'Blue',
        price: 49.99,
        stock: 20,
        productId: jeans.id,
      },
      {
        size: '34',
        color: 'Black',
        price: 49.99,
        stock: 25,
        productId: jeans.id,
      },
    ],
  });

  // 6️⃣ Orders
  await prisma.order.createMany({
    data: [
      {
        status: OrderStatus.PENDING,
        total: 1019.98,
        userId: user1.id,
      },
      {
        status: OrderStatus.CONFIRMED,
        total: 1999.99,
        userId: user2.id,
      },
      {
        status: OrderStatus.SHIPPED,
        total: 69.98,
        userId: user1.id,
      },
    ],
  });

  console.log('✅ Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
