import type { IpRiskResult } from '@/types';

// Brands with known IP enforcement on Amazon
const HIGH_RISK_BRANDS = [
  'Nike', 'Jordan', 'Converse',
  'Disney', 'Marvel', 'Star Wars', 'Pixar',
  'Apple', 'AirPods', 'MacBook', 'iPhone', 'iPad',
  'Samsung', 'Galaxy',
  'LEGO', 'Duplo',
  'Nintendo', 'Mario', 'Zelda', 'Pokemon', 'Pokémon',
  'Sony', 'PlayStation', 'PS5', 'PS4',
  'Microsoft', 'Xbox',
  'Gucci', 'Louis Vuitton', 'Chanel', 'Prada', 'Hermes', 'Hermès',
  'Rolex', 'Omega', 'Cartier',
  'Yeezy', 'Adidas',
  'Under Armour',
  'Beats', 'Bose',
  'GoPro',
  'Dyson',
  'Vitamix',
];

const MEDIUM_RISK_BRANDS = [
  'Ralph Lauren', 'Tommy Hilfiger', 'Calvin Klein',
  'Coach', 'Kate Spade', 'Michael Kors',
  'Mattel', 'Hasbro', 'Barbie', 'Hot Wheels',
  'Fisher-Price',
  'KitchenAid', 'Cuisinart',
  'Fitbit',
  'Nest', 'Ring',
  'OtterBox', 'LifeProof',
  'Crocs',
  'UGG',
  'Vans',
  'Sperry',
  'Timberland',
];

// Known restricted categories/keywords
const RESTRICTED_KEYWORDS = [
  'counterfeit', 'replica', 'knockoff', 'fake',
  'unauthorized', 'not for resale',
];

export function assessIpRisk(
  productName: string,
  brand?: string,
): IpRiskResult {
  const searchText = `${productName} ${brand ?? ''}`.toLowerCase();
  const flaggedBrands: string[] = [];
  const reasons: string[] = [];

  // Check high-risk brands
  for (const b of HIGH_RISK_BRANDS) {
    if (searchText.includes(b.toLowerCase())) {
      flaggedBrands.push(b);
      reasons.push(`Contains restricted brand: ${b}`);
    }
  }

  if (flaggedBrands.length > 0) {
    return { score: 'HIGH', reasons, flaggedBrands };
  }

  // Check medium-risk brands
  const mediumBrands: string[] = [];
  for (const b of MEDIUM_RISK_BRANDS) {
    if (searchText.includes(b.toLowerCase())) {
      mediumBrands.push(b);
    }
  }

  if (mediumBrands.length > 0) {
    return {
      score: 'MEDIUM',
      reasons: mediumBrands.map((b) => `Brand with IP history: ${b}`),
      flaggedBrands: mediumBrands,
    };
  }

  // Check restricted keywords
  for (const kw of RESTRICTED_KEYWORDS) {
    if (searchText.includes(kw)) {
      reasons.push(`Flagged keyword: "${kw}"`);
    }
  }

  if (reasons.length > 0) {
    return { score: 'MEDIUM', reasons, flaggedBrands: [] };
  }

  return { score: 'LOW', reasons: [], flaggedBrands: [] };
}

export function isAllowedByIpRules(productName: string, brand?: string): boolean {
  const result = assessIpRisk(productName, brand);
  return result.score === 'LOW';
}
