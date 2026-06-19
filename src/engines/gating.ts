import type { GatingInput, GatingResult, GatingRisk } from '@/types';

// Categories auto-ungated for most FBA sellers
const AUTO_UNGATED_CATEGORIES = new Set([
  'Arts & Crafts',
  'Baby',
  'Beauty',
  'Books',
  'Camera & Photo',
  'Cell Phones & Accessories',
  'Clothing',
  'Electronics',
  'Garden & Outdoor',
  'Grocery & Gourmet Food',
  'Health & Beauty',
  'Health & Household',
  'Home & Kitchen',
  'Luggage & Travel Gear',
  'Musical Instruments',
  'Office Products',
  'Pet Supplies',
  'Shoes',
  'Sports & Outdoors',
  'Tools & Home Improvement',
  'Toys & Games',
  'Video Games',
]);

// Brands with known aggressive IP enforcement
const HIGH_IP_BRANDS = new Set([
  'Nike', 'Adidas', 'Apple', 'Disney', 'LEGO', 'Marvel',
  'Star Wars', 'Pokémon', 'Nintendo', 'Sony', 'Samsung',
  'Dyson', 'Peloton', 'Vitamix', 'Yeti', 'Stanley',
  'Hydro Flask', 'Keurig', 'Nespresso',
]);

const MEDIUM_IP_BRANDS = new Set([
  'Under Armour', 'Reebok', 'Puma', 'New Balance', 'Asics',
  'KitchenAid', 'Cuisinart', 'Instant Pot', 'Ninja', 'Shark',
  'iRobot', 'Roomba', 'Bose', 'JBL', 'Beats',
]);

// Hazmat keywords
const HAZMAT_KEYWORDS = [
  'lithium battery', 'aerosol', 'flammable', 'corrosive',
  'bleach', 'paint thinner', 'acetone', 'propane',
  'compressed gas', 'acid', 'explosive', 'peroxide',
];

// Gated categories that require approval
const GATED_CATEGORIES = new Set([
  'Automotive',
  'Collectibles & Fine Art',
  'Entertainment Collectibles',
  'Fine Art',
  'Industrial & Scientific',
  'Music',
  'Sports Collectibles',
  'Watches',
  'Wine',
]);

export function assessGating(input: GatingInput): GatingResult {
  const { title, brand, category, hasHazmat: knownHazmat } = input;
  const reasons: string[] = [];
  let risk: GatingRisk = 'LOW';

  // Brand restriction check
  const isBrandRestricted = !!brand && HIGH_IP_BRANDS.has(brand);
  if (isBrandRestricted) {
    risk = 'HIGH';
    reasons.push(`High IP risk brand: ${brand}`);
  } else if (brand && MEDIUM_IP_BRANDS.has(brand)) {
    if ((risk as string) !== 'HIGH') risk = 'MEDIUM';
    reasons.push(`Medium IP risk brand: ${brand}`);
  }

  // Category gating check
  const isCategoryGated = !!category && GATED_CATEGORIES.has(category);
  if (isCategoryGated) {
    risk = 'HIGH';
    reasons.push(`Gated category: ${category}`);
  }

  // Hazmat check
  const titleLower = title.toLowerCase();
  const hasHazmat = knownHazmat || HAZMAT_KEYWORDS.some((kw) => titleLower.includes(kw));
  if (hasHazmat) {
    risk = 'HIGH';
    reasons.push('Potential hazmat materials detected');
  }

  // Auto-ungated check
  const autoUngated = !isCategoryGated && (!category || AUTO_UNGATED_CATEGORIES.has(category));

  return {
    risk,
    autoUngated,
    isBrandRestricted,
    isCategoryGated,
    hasHazmat,
    reasons,
  };
}

export function isCategoryAutoUngated(category: string): boolean {
  return AUTO_UNGATED_CATEGORIES.has(category);
}

// ─── Ungating outlook ────────────────────────────────────────────────────────
// A human-readable read on how easy a product is to actually sell, combining
// category openness + brand IP risk. This is more useful than the raw
// `autoUngated` flag, which reads "No" whenever the category is unknown/"Other"
// even for generic items that are almost certainly open.

export type UngatingKey = 'OPEN' | 'LIKELY_OPEN' | 'EASY' | 'APPROVAL' | 'RESTRICTED';

export interface UngatingOutlook {
  key:   UngatingKey;
  label: string;
  tone:  'good' | 'ok' | 'warn' | 'bad';
  hint:  string;
}

export function ungatingOutlook(p: {
  ipRiskScore?:       string | null;
  autoUngated?:       boolean | null;
  isBrandRestricted?: boolean | null;
  isCategoryGated?:   boolean | null;
  hasHazmat?:         boolean | null;
}): UngatingOutlook {
  if (p.hasHazmat) {
    return { key: 'RESTRICTED', label: 'Hazmat', tone: 'bad',
      hint: 'Hazmat items need special approval and FBA handling.' };
  }
  if (p.isBrandRestricted || p.ipRiskScore === 'HIGH') {
    return { key: 'RESTRICTED', label: 'Restricted brand', tone: 'bad',
      hint: 'High-IP brand — usually brand-gated and hard to ungate.' };
  }
  if (p.isCategoryGated) {
    return { key: 'APPROVAL', label: 'Approval needed', tone: 'warn',
      hint: 'Gated category — requires Amazon approval before you can sell.' };
  }
  if (p.ipRiskScore === 'MEDIUM') {
    return { key: 'EASY', label: 'Usually easy', tone: 'ok',
      hint: 'Mid-tier brand — typically ungated quickly with a wholesale invoice.' };
  }
  if (p.autoUngated) {
    return { key: 'OPEN', label: 'Open — no approval', tone: 'good',
      hint: 'Open category and low IP risk — sellable with no approval on most accounts.' };
  }
  // autoUngated is false but IP risk is low and it's not a gated category — the
  // category just couldn't be confirmed (often comes through as "Other").
  // Generic items here are almost always open; flag to verify, not to avoid.
  return { key: 'LIKELY_OPEN', label: 'Likely open', tone: 'good',
    hint: 'Low IP risk and not a gated category. Category unconfirmed — quick to verify, but generic items like this are usually open.' };
}
