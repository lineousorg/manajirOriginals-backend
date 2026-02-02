/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { PrismaClient, Role, OrderStatus, ImageType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  /* ============================
     USERS
  ============================ */

  const adminPassword = await bcrypt.hash('admin123', 10);
  const userPassword = await bcrypt.hash('user123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@shop.com' },
    update: {},
    create: {
      email: 'admin@shop.com',
      password: adminPassword,
      role: Role.ADMIN,
    },
  });

  const customer = await prisma.user.upsert({
    where: { email: 'customer@shop.com' },
    update: {},
    create: {
      email: 'customer@shop.com',
      password: userPassword,
      role: Role.CUSTOMER,
    },
  });

  /* ============================
     CATEGORIES
  ============================ */

  const fashion = await prisma.category.upsert({
    where: { slug: 'fashion' },
    update: {},
    create: {
      name: 'Fashion',
      slug: 'fashion',
    },
  });

  const tshirts = await prisma.category.upsert({
    where: { slug: 't-shirts' },
    update: {},
    create: {
      name: 'T-Shirts',
      slug: 't-shirts',
      parentId: fashion.id,
    },
  });

  /* ============================
     ATTRIBUTES
  ============================ */

  const sizeAttr = await prisma.attribute.upsert({
    where: { name: 'Size' },
    update: {},
    create: { name: 'Size' },
  });

  const colorAttr = await prisma.attribute.upsert({
    where: { name: 'Color' },
    update: {},
    create: { name: 'Color' },
  });

  const sizeM = await prisma.attributeValue.upsert({
    where: { id: 1 },
    update: {},
    create: {
      value: 'M',
      attributeId: sizeAttr.id,
    },
  });

  const sizeL = await prisma.attributeValue.upsert({
    where: { id: 2 },
    update: {},
    create: {
      value: 'L',
      attributeId: sizeAttr.id,
    },
  });

  const colorBlack = await prisma.attributeValue.upsert({
    where: { id: 3 },
    update: {},
    create: {
      value: 'Black',
      attributeId: colorAttr.id,
    },
  });

  const colorWhite = await prisma.attributeValue.upsert({
    where: { id: 4 },
    update: {},
    create: {
      value: 'White',
      attributeId: colorAttr.id,
    },
  });

  /* ============================
     PRODUCT
  ============================ */

  const tshirt = await prisma.product.upsert({
    where: { slug: 'premium-cotton-tshirt' },
    update: {},
    create: {
      name: 'Premium Cotton T-Shirt',
      slug: 'premium-cotton-tshirt',
      description: 'Soft premium cotton t-shirt',
      brand: 'UrbanWear',
      categoryId: tshirts.id,
    },
  });

  /* ============================
     PRODUCT VARIANTS
  ============================ */

  const blackM = await prisma.productVariant.upsert({
    where: { sku: 'TSHIRT-BLK-M' },
    update: {},
    create: {
      sku: 'TSHIRT-BLK-M',
      price: 29.99,
      stock: 50,
      productId: tshirt.id,
    },
  });

  const whiteL = await prisma.productVariant.upsert({
    where: { sku: 'TSHIRT-WHT-L' },
    update: {},
    create: {
      sku: 'TSHIRT-WHT-L',
      price: 29.99,
      stock: 30,
      productId: tshirt.id,
    },
  });

  /* ============================
     VARIANT ATTRIBUTES
  ============================ */

  await prisma.variantAttribute.createMany({
    data: [
      { variantId: blackM.id, attributeValueId: sizeM.id },
      { variantId: blackM.id, attributeValueId: colorBlack.id },
      { variantId: whiteL.id, attributeValueId: sizeL.id },
      { variantId: whiteL.id, attributeValueId: colorWhite.id },
    ],
    skipDuplicates: true,
  });

  /* ============================
     IMAGES
  ============================ */

  await prisma.image.createMany({
    data: [
      {
        url: 'https://picsum.photos/600/600?1',
        position: 1,
        type: ImageType.PRODUCT,
        productId: tshirt.id,
      },
      {
        url: 'https://picsum.photos/600/600?2',
        position: 1,
        type: ImageType.VARIANT,
        variantId: blackM.id,
      },
      {
        url: 'https://picsum.photos/600/600?3',
        position: 1,
        type: ImageType.VARIANT,
        variantId: whiteL.id,
      },
    ],
  });

  /* ============================
     ORDER
  ============================ */

  const order = await prisma.order.create({
    data: {
      userId: customer.id,
      status: OrderStatus.PAID,
      total: 59.98,
    },
  });

  await prisma.orderItem.createMany({
    data: [
      {
        orderId: order.id,
        variantId: blackM.id,
        quantity: 1,
        price: 29.99,
      },
      {
        orderId: order.id,
        variantId: whiteL.id,
        quantity: 1,
        price: 29.99,
      },
    ],
  });

  console.log('✅ Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
