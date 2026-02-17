"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt = __importStar(require("bcrypt"));
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('🌱 Seeding database...');
    const adminPassword = await bcrypt.hash('admin123', 10);
    const userPassword = await bcrypt.hash('user123', 10);
    const admin = await prisma.user.upsert({
        where: { email: 'admin@shop.com' },
        update: {},
        create: {
            email: 'admin@shop.com',
            password: adminPassword,
            role: client_1.Role.ADMIN,
        },
    });
    const customer = await prisma.user.upsert({
        where: { email: 'customer@shop.com' },
        update: {},
        create: {
            email: 'customer@shop.com',
            password: userPassword,
            role: client_1.Role.CUSTOMER,
        },
    });
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
    await prisma.variantAttribute.createMany({
        data: [
            { variantId: blackM.id, attributeValueId: sizeM.id },
            { variantId: blackM.id, attributeValueId: colorBlack.id },
            { variantId: whiteL.id, attributeValueId: sizeL.id },
            { variantId: whiteL.id, attributeValueId: colorWhite.id },
        ],
        skipDuplicates: true,
    });
    await prisma.image.createMany({
        data: [
            {
                url: 'https://picsum.photos/600/600?1',
                position: 1,
                type: client_1.ImageType.PRODUCT,
                productId: tshirt.id,
            },
            {
                url: 'https://picsum.photos/600/600?2',
                position: 1,
                type: client_1.ImageType.VARIANT,
                variantId: blackM.id,
            },
            {
                url: 'https://picsum.photos/600/600?3',
                position: 1,
                type: client_1.ImageType.VARIANT,
                variantId: whiteL.id,
            },
        ],
    });
    const order = await prisma.order.create({
        data: {
            userId: customer.id,
            status: client_1.OrderStatus.PAID,
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
//# sourceMappingURL=seed.js.map