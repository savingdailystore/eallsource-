// ─────────────────────────────────────────────
// Core Domain Types
// ─────────────────────────────────────────────

export type Role = 'USER' | 'ADMIN';
export type SubscriptionPlan = 'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE';
export type BuyBoxOwner = 'AMAZON' | 'FBA_SELLER' | 'FBM_SELLER' | 'NONE';
export type IpRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type ProductStatus = 'ACTIVE' | 'ARCHIVED' | 'FLAGGED';
export type BatchStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface DiscountItem {
  source: string;
  type: 'CASHBACK' | 'COUPON' | 'PROMO' | 'REWARD';
  amount: number;      // dollar value
  percentage?: number; // percentage off
  code?: string;
}

export interface Product {
  id: string;
  asin: string;
  upc?: string;
  name: string;
  category: string;
  imageUrl?: string;

  // Source
  sourceUrl: string;
  sourceRetailer: string;
  sourcePrice: number;
  availableDiscounts: DiscountItem[];
  discountSources: string[];
  finalCost: number;

  // Amazon
  amazonUrl: string;
  buyBoxPrice?: number;
  lowestListedPrice?: number;
  estimatedResellPrice: number;

  // Financials
  amazonFees: number;
  prepFee: number;
  taxAmount: number;
  netProfit: number;
  roi: number;

  // BSR
  bsr?: number;
  bsrPercentage?: number;
  bsrTrend?: 'TRENDING_UP' | 'TRENDING_DOWN' | 'STABLE';
  categoryRank?: number;
  categoryRankName?: string;
  seasonality?: 'YEAR_ROUND' | 'PEAK_SEASON' | 'OFF_SEASON' | 'TRENDING';

  // Competition
  fbaSellers: number;
  totalSellers: number;
  autoUngated: boolean;
  buyBoxOwner: BuyBoxOwner;
  amazonIsSeller: boolean;
  amazonOwnsBuyBox: boolean;

  // IP
  ipRiskScore: IpRiskLevel;
  ipRiskReasons: string[];

  // Exclusion flags
  hasBrandGating: boolean;
  hasCounterfeitRisk: boolean;
  isHazmat: boolean;
  isRestrictedCategory: boolean;

  // Meta
  keepaLink?: string;
  status: ProductStatus;
  dateAdded: string;
  weeklyBatchId?: string;
}

export interface SavedProduct {
  id: string;
  userId: string;
  productId: string;
  product: Product;
  notes?: string;
  tags: string[];
  isPurchased: boolean;
  purchaseDate?: string;
  purchaseQty?: number;
  createdAt: string;
}

export interface WeeklyBatch {
  id: string;
  weekNumber: number;
  year: number;
  status: BatchStatus;
  totalFound: number;
  totalPassed: number;
  createdAt: string;
  completedAt?: string;
  products?: Product[];
}

export interface DashboardMetrics {
  totalOpportunities: number;
  averageRoi: number;
  averageProfit: number;
  savedProducts: number;
  weeklyNewLeads: number;
  roiDistribution: { range: string; count: number }[];
  categoryDistribution: { category: string; count: number }[];
  buyBoxDistribution: { owner: string; count: number }[];
  retailerDistribution: { retailer: string; count: number }[];
}

// ─────────────────────────────────────────────
// Filter Types
// ─────────────────────────────────────────────

export interface ProductFilters {
  search?: string;
  category?: string;
  sourceRetailer?: string;
  buyBoxOwner?: BuyBoxOwner;
  amazonSellerPresent?: boolean;
  amazonBuyBoxPresent?: boolean;
  minRoi?: number;
  maxRoi?: number;
  minProfit?: number;
  maxProfit?: number;
  minPrice?: number;
  maxPrice?: number;
  minBsr?: number;
  maxBsr?: number;
  minCashback?: number;
  ipRisk?: IpRiskLevel;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ─────────────────────────────────────────────
// API Response
// ─────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ─────────────────────────────────────────────
// Repricer
// ─────────────────────────────────────────────

export type RepricingStrategy = 'WIN_BUY_BOX' | 'MAXIMIZE_PROFIT' | 'STAY_COMPETITIVE' | 'FLOOR_PRICE';
export type RepricingAction = 'INCREASE' | 'DECREASE' | 'HOLD';
export type BuyBoxStatus = 'SELF' | 'AMAZON' | 'OTHER_FBA' | 'OTHER_FBM' | 'NONE';

export interface SellerListing {
  sku: string;
  asin: string;
  productName: string;
  imageUrl?: string;
  condition: string;
  currentPrice: number;
  buyBoxPrice: number | null;
  buyBoxStatus: BuyBoxStatus;
  lowestFbaPrice: number | null;
  lowestFbmPrice: number | null;
  competitorCount: number;
  salesRank: number | null;
  fulfillableQty: number;
  fulfillmentChannel: 'FBA' | 'FBM';
}

export interface RepricerRule {
  id: string;
  userId: string;
  asin: string;
  sku: string;
  productName: string;
  minPrice: number;
  maxPrice: number;
  strategy: RepricingStrategy;
  targetMargin?: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RepricerLog {
  id: string;
  asin: string;
  sku: string;
  productName: string;
  oldPrice: number;
  newPrice: number;
  strategy: RepricingStrategy;
  reason: string;
  action: RepricingAction;
  competitorPrice?: number;
  buyBoxPrice?: number;
  createdAt: string;
}

export interface PricingDecision {
  recommendedPrice: number;
  action: RepricingAction;
  reason: string;
  confidence: number;
  estimatedBuyBoxOdds: number;
}

// ─────────────────────────────────────────────
// ROI Calculator
// ─────────────────────────────────────────────

export interface RoiInput {
  sourcePrice: number;
  discounts: DiscountItem[];
  resellPrice: number;
  category: string;
}

export interface RoiResult {
  finalCost: number;
  totalDiscounts: number;
  amazonFees: number;
  prepFee: number;
  taxAmount: number;
  netProfit: number;
  roi: number;
  qualifies: boolean;
}

// ─────────────────────────────────────────────
// IP Risk
// ─────────────────────────────────────────────

export interface IpRiskResult {
  score: IpRiskLevel;
  reasons: string[];
  flaggedBrands: string[];
}
