export interface RetailerHit {
  name: string;
  brand: string;
  retailer: string;
  sourcePrice: number;
  /** Direct URL to the specific product page (not a search page) */
  sourceUrl: string;
  imageUrl: string;
  upc?: string;
  /** Matched or looked-up Amazon ASIN */
  asin?: string;
  category: string;
}

export interface AmazonSnapshot {
  asin: string;
  buyBoxPrice: number;
  bsr: number;
  bsrCategory: string;
  fbaSellers: number;
  totalSellers: number;
  amazonOwnsBuyBox: boolean;
}

export interface ProfitBreakdown {
  sourcePrice: number;
  finalCost: number;
  cashbackAmount: number;
  resellPrice: number;
  amazonFees: number;
  prepFee: number;
  taxAmount: number;
  netProfit: number;
  roi: number;
}

export type AIRecommendation = 'BUY' | 'WATCH' | 'SKIP';
export type AIConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface AIDecision {
  score: number;               // 0–100
  recommendation: AIRecommendation;
  confidence: AIConfidence;
  reasons: string[];           // 2–3 positive factors
  risks: string[];             // 1–2 concerns
  note: string;                // one-sentence summary
  poweredByAI: boolean;        // true = Claude, false = rules engine
}

export interface SourceOpportunity {
  id: string;
  retailerHit: RetailerHit;
  amazon: AmazonSnapshot | null;
  profit: ProfitBreakdown;
  ipRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  aiDecision: AIDecision;
  scannedAt: string;
}
