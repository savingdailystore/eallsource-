/**
 * Manual repricer sanity check.
 *
 *   npx tsx scripts/test-repricer.ts
 *
 * Feeds the pricing engine known inputs and prints what it decides, with a
 * pass/fail assertion per scenario. This tests the DECISION LOGIC only — the
 * repricer is a recommendation engine and never pushes prices to Amazon.
 */
import { calculateReprice } from '@/engines/repricing';

type Strategy = 'COMPETITIVE' | 'FLOOR' | 'CEILING';

interface Case {
  name:   string;
  input:  Parameters<typeof calculateReprice>[0];
  expect: (r: ReturnType<typeof calculateReprice>) => boolean;
  why:    string;
}

const base = { asin: 'TEST', minRoi: 30, minProfit: 5 };

const cases: Case[] = [
  {
    name: 'COMPETITIVE · healthy margin · undercuts buy box by 0.5%',
    input: { ...base, costBasis: 10, currentPrice: 30, buyBoxPrice: 25, fbaSellers: 3, strategy: 'COMPETITIVE' as Strategy },
    expect: (r) => Math.abs(r.recommendedPrice - 24.88) < 0.02 && r.direction === 'DOWN',
    why: 'Target = 25 × 0.995 = 24.88, below current 30 → DOWN.',
  },
  {
    name: 'COMPETITIVE · crowded listing (12 FBA sellers) · holds to avoid price war',
    input: { ...base, costBasis: 10, currentPrice: 30, buyBoxPrice: 25, fbaSellers: 12, strategy: 'COMPETITIVE' as Strategy },
    expect: (r) => r.recommendedPrice === 30 && r.direction === 'HOLD' && r.riskScore === 70,
    why: '>10 FBA sellers → hold at current price, high risk.',
  },
  {
    name: 'COMPETITIVE · buy box below floor · protects floor',
    input: { ...base, costBasis: 20, currentPrice: 30, buyBoxPrice: 12, fbaSellers: 2, strategy: 'COMPETITIVE' as Strategy },
    expect: (r) => r.recommendedPrice > 12 && r.recommendedPrice >= 20,
    why: 'A buy box of 12 is below the ROI floor for a $20 cost → never chase it.',
  },
  {
    name: 'FLOOR · always prices at the protective floor',
    input: { ...base, costBasis: 10, currentPrice: 40, buyBoxPrice: 25, fbaSellers: 3, strategy: 'FLOOR' as Strategy },
    expect: (r) => r.direction === 'DOWN' && r.recommendedPrice < 40 && r.recommendedPrice >= 10,
    why: 'FLOOR strategy parks at the min-viable price; from 40 that is DOWN.',
  },
  {
    name: 'CEILING · prices just above buy box',
    input: { ...base, costBasis: 10, currentPrice: 20, buyBoxPrice: 25, fbaSellers: 3, strategy: 'CEILING' as Strategy },
    expect: (r) => Math.abs(r.recommendedPrice - 25.5) < 0.02 && r.direction === 'UP',
    why: 'min(25 × 1.02 = 25.5, 25 + 2 = 27) = 25.5, above current 20 → UP.',
  },
  {
    name: 'COMPETITIVE · manual floor higher than ROI floor binds',
    input: { ...base, costBasis: 10, currentPrice: 30, buyBoxPrice: 12, fbaSellers: 2, strategy: 'COMPETITIVE' as Strategy, floorPrice: 22 },
    expect: (r) => r.recommendedPrice >= 22,
    why: 'Manual floor of 22 must never be crossed even if ROI floor is lower.',
  },
  {
    name: 'COMPETITIVE · current price BELOW floor · proposes raising to floor (UP)',
    input: { ...base, minProfit: 3, costBasis: 10.89, currentPrice: 27, buyBoxPrice: 0, fbaSellers: 1, strategy: 'COMPETITIVE' as Strategy, floorPrice: 28.99 },
    expect: (r) => Math.abs(r.recommendedPrice - 28.99) < 0.02 && r.direction === 'UP',
    why: 'Current 27 < floor 28.99 → raise to 28.99, direction UP (was wrongly HOLD).',
  },
];

let pass = 0;
for (const c of cases) {
  const r  = calculateReprice(c.input);
  const ok = c.expect(r);
  if (ok) pass++;
  console.log(`\n${ok ? '✅ PASS' : '❌ FAIL'}  ${c.name}`);
  console.log(`   in : cost=$${c.input.costBasis} cur=$${c.input.currentPrice} buyBox=$${c.input.buyBoxPrice} fbaSellers=${c.input.fbaSellers}${c.input.floorPrice ? ` manualFloor=$${c.input.floorPrice}` : ''}`);
  console.log(`   out: price=$${r.recommendedPrice} dir=${r.direction} risk=${r.riskScore} — "${r.reason}"`);
  console.log(`   exp: ${c.why}`);
}

console.log(`\n${pass}/${cases.length} scenarios passed.`);
process.exit(pass === cases.length ? 0 : 1);
