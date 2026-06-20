/**
 * Reset a user's password directly in the DB (admin/dev use).
 * You supply the new password — it is hashed with bcrypt and stored.
 *
 * Run:  npx tsx scripts/reset-password.ts villaeric23@gmail.com "YourNewPassword123"
 */
import { prisma } from '../src/lib/prisma';
import bcrypt from 'bcryptjs';

async function main() {
  const email = process.argv[2];
  const newPassword = process.argv[3];

  if (!email || !newPassword) {
    console.error('Usage: npx tsx scripts/reset-password.ts <email> "<newPassword>"');
    process.exit(1);
  }
  if (newPassword.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user found with email "${email}".`);
    process.exit(1);
  }

  const hash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { email },
    data: { password: hash, passwordChangedAt: new Date() },
  });

  console.log(`\n✅ Password reset for ${email}. You can now sign in with the new password.\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
