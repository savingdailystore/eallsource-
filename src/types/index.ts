import type { Plan, Role, LeadStatus, DemandLevel, GatingRisk } from '@prisma/client';

// ─── NextAuth session augmentation ─────────────────────────────────────────

declare module 'next-auth' {
  interface User {
    id: string;
    role: Role;
    orgId: string;
    orgSlug: string;
    plan: Plan;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      role: Role;
      orgId: string;
      orgSlug: string;
      plan: Plan;
    };
  }
}

// JWT augmentation is handled inline in auth.ts via token casting

// ─── Discount ───────────────────────────────────────────────────────────────

export interface Discount {
  source: string;
  type: 'cashback' | 'coupon' | 'promo' | 'rewards';
  amount: number;
  percentage?: number;
  code?: string;
  url?: string;
}

// ─── Retailer plugin ────────────────────────────────────────────────────────

export interface RetailerProduct {
  title: string;
  brand?: string;
  upc?: string;
  ean?: string;
  model?: string;
  category?: string;
  price: number;
  listPrice?: number;   // original / "was" price before markdown
  onSale?: boolean;     // retailer flagged as on sale / rollback / clearance
  inStock: boolean;
  url: string;
  retailer: string;
  imageUrl?: string;
}

export interface RetailerPlugin {
  name: string;
  baseUrl: string;
  supportsApi: boolean;
  search(query: string, category?: string): Promise<RetailerProduct[]>;
  getProduct(url: string): Promise<RetailerProduct | null>;
}

// ─── Amazon matching ────────────────────────────────────────────────────────

export type MatchMethod = 'UPC' | 'EAN' | 'BRAND_MODEL' | 'TITLE_SIMILARITY';

export interface AmazonMatch {
  asin: string;
  amazonUrl: string;
  matchMethod: MatchMethod;
  matchConfidence: number;
}

// ─── Amazon product data ────────────────────────────────────────────────────

export interface AmazonProductData {
  asin: string;
  title: string;
  brand?: string;
  category?: string;
  imageUrl?: string;
  buyBoxPrice?: number;
  lowestFbaPrice?: number;
  bsr?: number;
  fbaSellers?: number;
  totalSellers?: number;
  amazonIsSeller?: boolean;
  amazonOwnsBuyBox?: boolean;
  referralFeeRate?: number;
  fbaFee?: number;
  storageFee?: number;
}

// ─── Profitability engine ───────────────────────────────────────────────────

export interface ProfitabilityInput {
  sourcePrice: number;
  sourceTax?: number;
  sourceShipping?: number;
  discounts: Discount[];
  resellPrice: number;
  category: string;
  prepFee?: number;
  referralFeeRate?: number;
  fbaFee?: number;
  storageFee?: number;
}

export interface ProfitabilityResult {
  finalCost: number;
  totalLandedCost: number;
  resellPrice: number;
  amazonFees: number;
  referralFee: number;
  fbaFee: number;
  storageFee: number;
  prepFee: number;
  taxAmount: number;
  profit: number;
  roi: number;
  margin: number;
  qualifies: boolean;
}

// ─── Validation engine ──────────────────────────────────────────────────────

export interface ValidationResult {
  identityScore: number;
  urlScore: number;
  priceScore: number;
  inventoryScore: number;
  passed: boolean;
  reasons: string[];
}

// ─── Lead scoring engine ────────────────────────────────────────────────────

export interface ScoringInput {
  roi: number;
  demandLevel: DemandLevel;
  matchConfidence: number;
  gatingRisk: GatingRisk;
  priceStability: 'STABLE' | 'VOLATILE' | 'UNKNOWN';
}

// ─── Demand engine ──────────────────────────────────────────────────────────

export interface DemandInput {
  bsr: number;
  category: string;
  fbaSellers: number;
  totalSellers: number;
  priceHistory?: number[];
}

export interface DemandResult {
  level: DemandLevel;
  reasons: string[];
}

// ─── Gating engine ──────────────────────────────────────────────────────────

export interface GatingInput {
  title: string;
  brand?: string;
  category?: string;
  hasHazmat?: boolean;
}

export interface GatingResult {
  risk: GatingRisk;
  autoUngated: boolean;
  isBrandRestricted: boolean;
  isCategoryGated: boolean;
  hasHazmat: boolean;
  reasons: string[];
}

// ─── Repricing engine ───────────────────────────────────────────────────────

export interface RepricingInput {
  asin: string;
  costBasis: number;
  currentPrice: number;
  buyBoxPrice: number;
  fbaSellers: number;
  minRoi: number;
  minProfit: number;
  strategy: 'COMPETITIVE' | 'FLOOR' | 'CEILING';
  floorPrice?: number; // optional manual hard floor
}

export interface RepricingResult {
  recommendedPrice: number;
  direction: 'UP' | 'DOWN' | 'HOLD';
  riskScore: number;
  reason: string;
}

// ─── API response types ─────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiResponse<T = null> {
  success: boolean;
  data?: T;
  error?: string;
}

// ─── Plan limits ─────────────────────────────────────────────────────────────

export const PLAN_LIMITS: Record<Plan, { leadsPerDay: number; repricing: boolean; spApi: boolean; apiAccess: boolean; maxUsers: number }> = {
  STARTER:    { leadsPerDay: 20,   repricing: false, spApi: false, apiAccess: false, maxUsers: 1  },
  PRO:        { leadsPerDay: 500,  repricing: true,  spApi: true,  apiAccess: false, maxUsers: 5  },
  ENTERPRISE: { leadsPerDay: 9999, repricing: true,  spApi: true,  apiAccess: true,  maxUsers: 99 },
};

export { Plan, Role, LeadStatus, DemandLevel, GatingRisk };
