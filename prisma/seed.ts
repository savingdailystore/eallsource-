import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) throw new Error('ADMIN_PASSWORD env var is required to seed — do not use a hardcoded fallback');
  const adminPw = await bcrypt.hash(adminPassword, 12);
  const demoPw  = await bcrypt.hash('Demo123!', 12);

  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 14);

  // Owner org
  const ownerOrg = await prisma.organization.upsert({
    where:  { slug: 'eallsource-main' },
    update: { plan: 'PRO' },
    create: { name: 'EALLsource', slug: 'eallsource-main', plan: 'PRO' },
  });

  await prisma.user.upsert({
    where:  { email: process.env.ADMIN_EMAIL ?? 'savingdailystore@gmail.com' },
    update: { password: adminPw, role: 'OWNER', orgId: ownerOrg.id },
    create: {
      email:    process.env.ADMIN_EMAIL ?? 'savingdailystore@gmail.com',
      password: adminPw,
      name:     'Eric',
      role:     'OWNER',
      orgId:    ownerOrg.id,
    },
  });

  await prisma.subscription.upsert({
    where:  { orgId: ownerOrg.id },
    update: {},
    create: { orgId: ownerOrg.id, plan: 'PRO', status: 'trialing', trialEndsAt },
  });

  // Demo org
  const demoOrg = await prisma.organization.upsert({
    where:  { slug: 'demo-account' },
    update: {},
    create: { name: 'Demo Account', slug: 'demo-account', plan: 'STARTER' },
  });

  await prisma.user.upsert({
    where:  { email: 'demo@eallsource.com' },
    update: {},
    create: {
      email:    'demo@eallsource.com',
      password: demoPw,
      name:     'Demo User',
      role:     'ANALYST',
      orgId:    demoOrg.id,
    },
  });

  await prisma.subscription.upsert({
    where:  { orgId: demoOrg.id },
    update: {},
    create: { orgId: demoOrg.id, plan: 'STARTER', status: 'trialing', trialEndsAt },
  });

  // Sample products for owner org
  await prisma.product.deleteMany({ where: { orgId: ownerOrg.id } });

  const products = [
    {
      orgId:        ownerOrg.id,
      asin:         'B09B4MLLZ3',
      upc:          '069055855664',
      title:        'Oral-B Pro 1000 Rechargeable Electric Toothbrush, Black',
      brand:        'Oral-B',
      category:     'Health & Beauty',
      sourceUrl:    'https://www.walmart.com/ip/oral-b-pro-1000/654321',
      sourceRetailer: 'Walmart',
      sourcePrice:  29.99,
      availableDiscounts: [
        { source: 'Rakuten', type: 'cashback', amount: 3.00, percentage: 10.0 },
        { source: 'BeFrugal', type: 'cashback', amount: 1.50, percentage: 5.0 },
      ],
      discountSources:  ['Rakuten', 'BeFrugal'],
      finalCost:        25.49,
      amazonUrl:        'https://www.amazon.com/dp/B09B4MLLZ3',
      buyBoxPrice:      54.97,
      lowestFbaPrice:   52.99,
      price:            52.99,
      amazonFees:       7.95,
      prepFee:          1.50,
      taxAmount:        2.10,
      fees:             11.55,
      profit:           15.95,
      roi:              62.6,
      bsr:              1234,
      bsrPercentage:    0.05,
      autoUngated:      true,
      buyBoxOwner:      'FBA_SELLER',
      amazonOwnsBuyBox: false,
      ipRiskScore:      'LOW',
      gatingRisk:       'LOW' as const,
      demandLevel:      'HIGH' as const,
      matchMethod:      'UPC',
      matchConfidence:  99,
      identityScore:    100,
      urlScore:         98,
      priceScore:       99,
      inventoryScore:   99,
      validationPassed: true,
      keepaLink:        'https://keepa.com/#!product/1-B09B4MLLZ3',
      score:            82,
    },
    {
      orgId:        ownerOrg.id,
      asin:         'B07NF76M5L',
      upc:          '086279117809',
      title:        "Cuisinart DCC-3200P1 Perfectemp Coffee Maker, 14 Cup Programmable",
      brand:        'Cuisinart',
      category:     'Home & Kitchen',
      sourceUrl:    "https://www.kohls.com/product/cuisinart-coffee-maker/12345.jsp",
      sourceRetailer: "Kohl's",
      sourcePrice:  39.99,
      availableDiscounts: [
        { source: 'Rakuten', type: 'cashback', amount: 2.00, percentage: 5.0 },
        { source: 'CardBear', type: 'rewards', amount: 5.00 },
      ],
      discountSources:  ['Rakuten', 'CardBear'],
      finalCost:        32.99,
      amazonUrl:        'https://www.amazon.com/dp/B07NF76M5L',
      buyBoxPrice:      89.99,
      lowestFbaPrice:   79.99,
      price:            79.99,
      amazonFees:       16.00,
      prepFee:          2.00,
      taxAmount:        2.80,
      fees:             20.80,
      profit:           26.20,
      roi:              79.4,
      bsr:              5678,
      bsrPercentage:    0.11,
      autoUngated:      true,
      buyBoxOwner:      'FBA_SELLER',
      amazonOwnsBuyBox: false,
      ipRiskScore:      'LOW',
      gatingRisk:       'LOW' as const,
      demandLevel:      'HIGH' as const,
      matchMethod:      'UPC',
      matchConfidence:  99,
      identityScore:    100,
      urlScore:         98,
      priceScore:       100,
      inventoryScore:   99,
      validationPassed: true,
      keepaLink:        'https://keepa.com/#!product/1-B07NF76M5L',
      score:            88,
    },
    {
      orgId:        ownerOrg.id,
      asin:         'B08BHXG144',
      upc:          '885911750738',
      title:        'BLACK+DECKER Dustbuster AdvancedClean Cordless Hand Vacuum, 20V',
      brand:        'BLACK+DECKER',
      category:     'Home & Kitchen',
      sourceUrl:    'https://www.homedepot.com/p/black-decker-vac/303412345',
      sourceRetailer: 'Home Depot',
      sourcePrice:  29.99,
      availableDiscounts: [
        { source: 'Capital One Shopping', type: 'cashback', amount: 0.60, percentage: 2.0 },
        { source: 'RetailMeNot', type: 'coupon', amount: 2.00, code: 'HD2OFF' },
      ],
      discountSources:  ['Capital One Shopping', 'RetailMeNot'],
      finalCost:        27.39,
      amazonUrl:        'https://www.amazon.com/dp/B08BHXG144',
      buyBoxPrice:      69.99,
      lowestFbaPrice:   62.99,
      price:            62.99,
      amazonFees:       13.75,
      prepFee:          2.50,
      taxAmount:        2.10,
      fees:             18.35,
      profit:           17.25,
      roi:              63.0,
      bsr:              7891,
      bsrPercentage:    0.16,
      autoUngated:      true,
      buyBoxOwner:      'FBA_SELLER',
      amazonOwnsBuyBox: false,
      ipRiskScore:      'LOW',
      gatingRisk:       'LOW' as const,
      demandLevel:      'HIGH' as const,
      matchMethod:      'UPC',
      matchConfidence:  99,
      identityScore:    99,
      urlScore:         98,
      priceScore:       99,
      inventoryScore:   100,
      validationPassed: true,
      keepaLink:        'https://keepa.com/#!product/1-B08BHXG144',
      score:            76,
    },
  ];

  for (const product of products) {
    const p = await prisma.product.create({ data: product });
    await prisma.lead.create({ data: { orgId: ownerOrg.id, productId: p.id, score: product.score, status: 'NEW' } });
  }

  console.log(`✓ ${process.env.ADMIN_EMAIL ?? 'savingdailystore@gmail.com'} (PRO — password set from ADMIN_PASSWORD env var)`);
  console.log('✓ demo@eallsource.com / Demo123! (STARTER)');
  console.log(`✓ ${products.length} seed products`);
  console.log('Seeding complete.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
