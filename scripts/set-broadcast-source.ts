import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: 'savingdailystore@gmail.com' },
    select: { orgId: true },
  });

  if (!user) {
    console.error('User not found');
    process.exit(1);
  }

  const org = await prisma.organization.update({
    where: { id: user.orgId },
    data:  { isBroadcastSource: true, receiveBroadcast: false },
    select: { id: true, name: true, isBroadcastSource: true, receiveBroadcast: true },
  });

  console.log('✅ Broadcast source set:', org);
}

main().finally(() => prisma.$disconnect());
