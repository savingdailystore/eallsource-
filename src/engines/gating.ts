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
  'Lululemon', 'Patagonia', 'The North Face', 'Crocs', 'Birkenstock',
  'Ray-Ban', 'Oakley', 'Funko', 'Hasbro', 'Mattel', 'Harry Potter',
  'Supreme', 'Gucci', 'Louis Vuitton', 'Chanel', 'GoPro',
]);

const MEDIUM_IP_BRANDS = new Set([
  'Under Armour', 'Reebok', 'Puma', 'New Balance', 'Asics',
  'KitchenAid', 'Cuisinart', 'Instant Pot', 'Ninja', 'Shark',
  'iRobot', 'Roomba', 'Bose', 'JBL', 'Beats',
]);

// Amazon's own private-label brands. These are manufactured and sold
// exclusively by Amazon — there is no buy box to win and no legitimate way to
// source genuine inventory through retail arbitrage, so any match here is a
// dead lead regardless of margin.
const PRIVATE_LABEL_BRANDS = new Set([
  'amazon basics', 'amazonbasics', 'amazon essentials', 'amazon collection',
  'solimo', 'presto!', 'presto', 'happy belly', 'mama bear', 'mama bear organic',
  'wag', 'revly', 'goodthreads', 'amazon brand', 'core 10', 'daily ritual',
  'symbology', 'find.', 'lark & ro', 'buttoned down', '206 collective',
  'amazon elements', 'pinzon', 'rivet', 'stone & beam', 'rivet & quartz',
  'ravenna home', 'mr. beams', 'mr beams', 'pikolin home', 'gravity',
  'vedo', 'today\'s woman',
]);

// Hazmat / dangerous goods keywords — covers common FBA-restricted materials
// (flammables, corrosives, batteries, pressurized containers, oxidizers).
const HAZMAT_KEYWORDS = [
  'lithium battery', 'lithium-ion', 'lithium ion', 'aerosol', 'flammable',
  'corrosive', 'bleach', 'paint thinner', 'acetone', 'propane', 'butane',
  'compressed gas', 'acid', 'explosive', 'peroxide', 'pesticide',
  'fertilizer', 'ammonia', 'gasoline', 'kerosene', 'lighter fluid',
  'oxidizer', 'pressurized', 'combustible', 'toxic', 'poison',
  'rechargeable battery', 'car battery', 'gun powder', 'gunpowder',
];

// Meltable / temperature-sensitive keywords — risk depends on season and
// shipping speed, not a fixed disqualifier, so this is informational only.
const MELTABLE_KEYWORDS = [
  'chocolate', 'candle', 'wax melt', 'wax', 'gummy', 'gummies', 'lip balm',
  'lipstick', 'crayon', 'gum', 'caramel', 'marshmallow', 'cheese',
  'butter', 'cocoa', 'lotion bar', 'bath bomb', 'soap bar', 'deodorant stick',
];

// Brand strings that indicate "no real brand" — unbranded/private-seller
// listings. These carry higher IP-complaint risk (anyone can claim
// infringement on an unbranded knockoff) and unreliable supply since there's
// no actual manufacturer backing the listing.
const GENERIC_BRAND_PATTERNS = [
  'generic', 'unbranded', 'no brand', 'n/a', 'na', 'none', 'other',
  'various', 'assorted', 'oem', 'unknown',
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

  // Private-label check — no buy box to win, hard reject regardless of margin
  const isPrivateLabel = !!brand && PRIVATE_LABEL_BRANDS.has(brand.toLowerCase().trim());
  if (isPrivateLabel) {
    risk = 'HIGH';
    reasons.push(`Amazon private-label brand: ${brand} — no buy box to win`);
  }

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

  // Hazmat / dangerous goods check
  const titleLower = title.toLowerCase();
  const hasHazmat = knownHazmat || HAZMAT_KEYWORDS.some((kw) => titleLower.includes(kw));
  if (hasHazmat) {
    risk = 'HIGH';
    reasons.push('Potential hazmat / dangerous goods materials detected');
  }

  // Meltable check — informational only, doesn't raise risk or block
  const isMeltable = MELTABLE_KEYWORDS.some((kw) => titleLower.includes(kw));
  if (isMeltable) {
    reasons.push('Temperature-sensitive item — melt risk in transit/storage during warm months');
  }

  // Generic / unbranded check — no brand at all, or a brand string that's
  // really just a placeholder rather than a real manufacturer name.
  const brandNorm = (brand ?? '').toLowerCase().trim();
  const isGenericBrand = !brand || GENERIC_BRAND_PATTERNS.includes(brandNorm);
  if (isGenericBrand) {
    risk = 'HIGH';
    reasons.push(brand ? `Generic/placeholder brand: ${brand}` : 'No brand provided');
  }

  // Auto-ungated check
  const autoUngated = !isCategoryGated && (!category || AUTO_UNGATED_CATEGORIES.has(category));

  return {
    risk,
    autoUngated,
    isBrandRestricted,
    isCategoryGated,
    hasHazmat,
    isPrivateLabel,
    isGenericBrand,
    isMeltable,
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
  isPrivateLabel?:    boolean | null;
  isGenericBrand?:    boolean | null;
}): UngatingOutlook {
  if (p.isPrivateLabel) {
    return { key: 'RESTRICTED', label: 'Private label', tone: 'bad',
      hint: "Amazon's own brand — Amazon holds the buy box exclusively, there's nothing to win here." };
  }
  if (p.hasHazmat) {
    return { key: 'RESTRICTED', label: 'Hazmat', tone: 'bad',
      hint: 'Hazmat / dangerous goods — needs special approval and FBA handling.' };
  }
  if (p.isGenericBrand) {
    return { key: 'RESTRICTED', label: 'Generic / unbranded', tone: 'bad',
      hint: 'No real brand on file — higher IP-complaint and supply risk, generally avoided.' };
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
