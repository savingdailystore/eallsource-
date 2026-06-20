import type { AmazonMatch, MatchMethod } from '@/types';

// In production this calls Amazon Product Advertising API / SP-API Catalog API.
// Here we define the interface and a structured stub.

interface MatchInput {
  upc?: string;
  ean?: string;
  brand?: string;
  model?: string;
  title: string;
}

// Confidence thresholds per method
const METHOD_CONFIDENCE: Record<MatchMethod, number> = {
  UPC:              99,
  EAN:              99,
  BRAND_MODEL:      85,
  TITLE_SIMILARITY: 70,
  MANUAL:           100,
};

export async function findAmazonMatch(input: MatchInput): Promise<AmazonMatch | null> {
  // Priority 1: UPC
  if (input.upc) {
    const result = await searchByUpc(input.upc);
    if (result) return { ...result, matchMethod: 'UPC', matchConfidence: METHOD_CONFIDENCE.UPC };
  }

  // Priority 2: EAN
  if (input.ean) {
    const result = await searchByEan(input.ean);
    if (result) return { ...result, matchMethod: 'EAN', matchConfidence: METHOD_CONFIDENCE.EAN };
  }

  // Priority 3: Brand + Model
  if (input.brand && input.model) {
    const result = await searchByBrandModel(input.brand, input.model);
    if (result) return { ...result, matchMethod: 'BRAND_MODEL', matchConfidence: METHOD_CONFIDENCE.BRAND_MODEL };
  }

  // Priority 4: Semantic title similarity
  if (input.title) {
    const result = await searchByTitle(input.title);
    if (result) {
      const confidence = result.confidence ?? METHOD_CONFIDENCE.TITLE_SIMILARITY;
      if (confidence < 70) return null; // reject per spec
      return { asin: result.asin, amazonUrl: result.amazonUrl, matchMethod: 'TITLE_SIMILARITY', matchConfidence: confidence };
    }
  }

  return null;
}

// ── Stub implementations (replace with real API calls) ────────────────────

async function searchByUpc(upc: string): Promise<{ asin: string; amazonUrl: string } | null> {
  // TODO: Call SP-API Catalog API: GET /catalog/2022-04-01/items?keywords={upc}&identifiersType=UPC
  console.log('[matching] searchByUpc:', upc);
  return null;
}

async function searchByEan(ean: string): Promise<{ asin: string; amazonUrl: string } | null> {
  // TODO: Call SP-API Catalog API with EAN
  console.log('[matching] searchByEan:', ean);
  return null;
}

async function searchByBrandModel(brand: string, model: string): Promise<{ asin: string; amazonUrl: string } | null> {
  // TODO: Call SP-API Catalog API: GET /catalog/2022-04-01/items?keywords={brand}+{model}
  console.log('[matching] searchByBrandModel:', brand, model);
  return null;
}

async function searchByTitle(title: string): Promise<{ asin: string; amazonUrl: string; confidence?: number } | null> {
  // TODO: Call SP-API Catalog API with title, compute similarity score
  console.log('[matching] searchByTitle:', title);
  return null;
}
