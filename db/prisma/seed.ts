import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const MOCK_PRODUCTS = [
  { asin: 'B09B4MLLZ3', title: 'Oral-B Pro 1000 Rechargeable Electric Toothbrush, Black',               price: 54.97, fees: 8.97,  profit: 11.33, roi: 37.1, score: 72 },
  { asin: 'B07FZ8S74R', title: 'Instant Pot Duo 7-in-1 Electric Pressure Cooker, 6 Quart',              price: 99.95, fees: 18.72, profit: 14.19, roi: 29.9, score: 58 },
  { asin: 'B00TTD9BRC', title: 'CeraVe Moisturizing Cream for Normal to Dry Skin, 19 oz',               price: 24.99, fees: 5.25,  profit: 5.37,  roi: 45.6, score: 78 },
  { asin: 'B07NF76M5L', title: 'Cuisinart DCC-3200P1 Perfectemp Coffee Maker, 14 Cup Programmable',     price: 89.99, fees: 17.22, profit: 17.03, roi: 44.2, score: 75 },
  { asin: 'B00A2KD8NY', title: 'Hasbro Gaming Monopoly Classic Board Game',                             price: 29.97, fees: 5.72,  profit: 7.44,  roi: 66.4, score: 88 },
  { asin: 'B07HBQPZP9', title: 'Sharpie Permanent Markers Fine Point, Assorted Colors, 24 Count',       price: 23.99, fees: 5.62,  profit: 3.96,  roi: 41.7, score: 68 },
  { asin: 'B08BHXG144', title: 'BLACK+DECKER Dustbuster AdvancedClean Cordless Hand Vacuum, 20V',       price: 69.99, fees: 13.47, profit: 12.79, roi: 42.1, score: 70 },
  { asin: 'B082CRYZ3R', title: 'Sharpie S-Gel Pens Fine Point (0.5mm), Black Ink, 4 Count',             price: 14.99, fees: 3.75,  profit: 2.03,  roi: 33.9, score: 55 },
];

async function main() {
  console.log('Seeding database...');

  const adminPw = await bcrypt.hash(process.env.ADMIN_PASSWORD ?? 'Admin123!', 12);
  const demoPw  = await bcrypt.hash('Demo123!', 12);

  await prisma.user.upsert({
    where:  { email: process.env.ADMIN_EMAIL ?? 'admin@eallsource.com' },
    update: {},
    create: { email: process.env.ADMIN_EMAIL ?? 'admin@eallsource.com', password: adminPw },
  });

  await prisma.user.upsert({
    where:  { email: 'demo@eallsource.com' },
    update: {},
    create: { email: 'demo@eallsource.com', password: demoPw },
  });

  // Clear existing products and leads to avoid stale data
  await prisma.lead.deleteMany({});
  await prisma.product.deleteMany({});

  for (const p of MOCK_PRODUCTS) {
    const product = await prisma.product.create({ data: p });
    await prisma.lead.create({
      data: { productId: product.id, score: p.score, status: 'NEW' },
    });
  }

  console.log(`✓ ${process.env.ADMIN_EMAIL ?? 'admin@eallsource.com'} / ${process.env.ADMIN_PASSWORD ?? 'Admin123!'}`);
  console.log('✓ demo@eallsource.com / Demo123!');
  console.log(`✓ ${MOCK_PRODUCTS.length} products + leads seeded`);
  console.log('Seeding complete.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
