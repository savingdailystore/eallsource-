import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'savingdailystore@gmail.com';
  const password = 'EALLsource@Admin1';
  const hash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: { role: 'ADMIN', passwordHash: hash, subscriptionPlan: 'PRO' },
    create: {
      email,
      name: 'Eric',
      passwordHash: hash,
      role: 'ADMIN',
      subscriptionPlan: 'PRO',
    },
  });

  console.log('✅ Admin account ready:');
  console.log('   Email   :', user.email);
  console.log('   Password: EALLsource@Admin1');
  console.log('   Role    :', user.role);
  console.log('   Plan    :', user.subscriptionPlan);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
