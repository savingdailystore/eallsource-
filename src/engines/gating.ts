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
