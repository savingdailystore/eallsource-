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

export type MatchMethod = 'UPC' | 'EAN' | 'BRAND_MODEL' | 'TITLE_SIMILARITY' | 'MANUAL';

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
  buyBoxSuppressed?: boolean; // offers exist but no buy box is shown
  isVariation?: boolean;      // this ASIN is a child of a parent variation listing
  parentAsin?: string;        // parent ASIN when isVariation is true
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
  feeEstimateConfirmed: boolean;
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
  bsr?: number; // undefined = Amazon returned no sales rank for this ASIN
  category: string;
  fbaSellers: number;
  totalSellers: number;
  monthlySales?: number;   // estimated units sold per month (Keepa); undefined = unknown
  priceHistory?: number[];
}

export interface DemandResult {
  level: DemandLevel;
  reasons: string[];
  monthlySales?: number;          // echoed through for persistence/display
  expectedUnitsPerSeller?: number; // monthlySales / (fbaSellers + 1)
  velocityTooLow: boolean;        // true when we have data and share is below the floor
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
  isPrivateLabel: boolean;
  isGenericBrand: boolean;
  isMeltable: boolean;
  reasons: string[];
}

// ─── Confidence engine (Phase 1, Features 1 & 2) ────────────────────────────
// Confidence is NOT a renamed lead score — it's a separate "should I buy
// this?" judgment layered on top of the score, reinforced (or undermined) by
// historical evidence the score formula doesn't see (Amazon's presence
// pattern, Buy Box stability duration, review depth). One signal evaluator
// produces both the "primary reasons" (Feature 1, capped list) and the full
// reasons/concerns breakdown (Feature 2) — see engines/confidence.ts.

import type { KeepaHistorySnapshot } from '@/lib/keepa';

export interface ConfidenceInput {
  score:           number; // existing 0–100 lead score
  roi:             number;
  demandLevel:     DemandLevel;
  gatingRisk:       GatingRisk;
  priceStability:  'STABLE' | 'VOLATILE' | 'UNKNOWN';
  priceTrend:      'RISING' | 'FLAT' | 'DECLINING' | 'UNKNOWN' | null;
  totalSellers:    number;
  fbaSellers:      number;
  amazonIsSeller:  boolean;
  buyBoxSuppressed: boolean;
  rating?:         number | null;
  reviewCount?:    number | null;
  lowReviews:      boolean;
  monthlySales?:   number | null;
  keepaHistory?:   KeepaHistorySnapshot | null;
}

// A single deterministic, data-backed observation. `weight` ranks signals
// for Feature 1's capped "primary reasons" list — it has no other meaning.
export interface ConfidenceSignal {
  label:  string;
  weight: number;
}

export interface ConfidenceResult {
  confidence:      number; // 0–100
  stars:           number; // 1–5, derived from confidence
  recommendation:  'Excellent Buy' | 'Strong Buy' | 'Good Buy' | 'Risky' | 'Avoid';
  primaryReasons:  string[]; // Feature 1 — top positive signals only, capped
  reasons:         string[]; // Feature 2 — all positive signals
  concerns:        string[]; // Feature 2 — all negative signals
}

// ─── Risk presentation (Phase 1, Feature 4) ─────────────────────────────────

export type RiskLevel = 'VERY_LOW' | 'LOW' | 'MEDIUM' | 'HIGH';

export interface RiskCategory {
  category: 'Pricing' | 'Competition' | 'Amazon' | 'IP' | 'Storage';
  level:    RiskLevel;
  reason:   string; // why this level, in plain language, from real fields
}

export interface RiskBreakdown {
  overall:    RiskLevel;
  categories: RiskCategory[];
}

// Input to engines/riskPresentation.ts — purely a categorization/explanation
// layer over fields already computed by the gating engine and pipeline. It
// does not recompute risk; isPrivateLabel/isBrandRestricted/etc. come
// straight from GatingResult, persisted on Product.
export interface RiskPresentationInput {
  priceStability:    'STABLE' | 'VOLATILE' | 'UNKNOWN';
  priceTrend:        'RISING' | 'FLAT' | 'DECLINING' | 'UNKNOWN' | null;
  totalSellers:      number;
  amazonIsSeller:    boolean;
  buyBoxSuppressed:  boolean;
  ipRiskScore:       string;
  isPrivateLabel:    boolean;
  isBrandRestricted: boolean;
  isGenericBrand:    boolean;
  hasHazmat:         boolean;
  isMeltable:        boolean;
  amazonAbsentPct?:  number; // from keepaHistoryMetrics.amazonPresence, when available
}

// ─── Opportunity timeline (Phase 1, Feature 3) ──────────────────────────────

export interface TimelineEvent {
  at:    number; // unix ms
  label: string; // e.g. "Amazon exited listing"
}

// ─── Historical sales intelligence (Phase 1, Feature 5) ────────────────────

export interface HistoricalInsight {
  text: string; // plain-language, fully derived from stored history — never fabricated
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

// Lead tiers accessible per plan — checked at delivery/unlock time only.
// Existing entitlements are never revoked by a plan change; this governs
// which tiers can be newly unlocked for an org on a given plan.
export type LeadTierValue = 'BASIC' | 'PRO' | 'PREMIUM';

export const PLAN_LIMITS: Record<Plan, {
  leadsPerWeek:     number;
  allowedLeadTiers: LeadTierValue[];
  repricing:        boolean;
  spApi:            boolean;
  apiAccess:        boolean;
  maxUsers:         number;
}> = {
  STARTER:    { leadsPerWeek: 3,    allowedLeadTiers: ['BASIC'],                   repricing: false, spApi: false, apiAccess: false, maxUsers: 1  },
  PRO:        { leadsPerWeek: 15,   allowedLeadTiers: ['BASIC', 'PRO'],            repricing: true,  spApi: true,  apiAccess: false, maxUsers: 1  },
  ENTERPRISE: { leadsPerWeek: 9999, allowedLeadTiers: ['BASIC', 'PRO', 'PREMIUM'], repricing: true,  spApi: true,  apiAccess: true,  maxUsers: 99 },
};

export { Plan, Role, LeadStatus, DemandLevel, GatingRisk };
