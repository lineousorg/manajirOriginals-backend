/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  /* ============================
     USERS (Admin only)
  ============================ */

  const adminPassword = await bcrypt.hash('admin@Manajir', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@manajir.com' },
    update: {},
    create: {
      email: 'admin@manajir.com',
      password: adminPassword,
      role: Role.ADMIN,
    },
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
