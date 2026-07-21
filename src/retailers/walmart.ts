import { BaseRetailer } from './base';
import { runApifyActor } from '@/lib/apify';
import { lookupUpcCache, writeUpcCache, isValidUpc } from '@/lib/upc-cache';
import type { RetailerProduct } from '@/types';
import type { UpcEnrichmentMetrics } from '@/services/run-scan';

// Apify actor handles Walmart's PerimeterX bot-detection/proxy rotation for us.
// https://apify.com/automation-lab/walmart-scraper
const ACTOR_ID = 'automation-lab/walmart-scraper';

// UPC enrichment: the search actor returns no UPC (it's only on detail pages),
// so we enrich the top products via a per-URL detail scraper (pay-per-event).
// Exact UPC matching is far more reliable than fuzzy title matching.
// https://apify.com/pratikdani/walmart-product-scraper
const UPC_ACTOR        = 'pratikdani/walmart-product-scraper';
const UPC_ENRICH_LIMIT = 18;     // enrich every product we hand off (matches MAX_PRODUCTS)
const UPC_CONCURRENCY  = 7;      // parallel detail fetches — more rounds finish per wall-second
// Direct testing (2026-06-21) showed pratikdani returns UPCs reliably but each
// lookup takes ~4–35s. The old 25s cap aborted the slow-but-valid ones, so only
// ~1–2 of 18 products got a UPC. 45s captures the slow tail; concurrency keeps
// total wall-time bounded since most lookups finish in well under 10s.
const UPC_TIMEOUT_MS   = 45_000;

// Hard cap on products handed to the pipeline per search. Each product costs
// several Amazon SP-API calls, so this bounds total run time on serverless.
const MAX_PRODUCTS = 18;

interface ApifyWalmartItem {
  name?: string;
  brand?: string;
  price?: number;
  wasPrice?: number;
  onSale?: boolean;
  url?: string;
  thumbnail?: string;
  seller?: string;
}

interface PratikItem {
  upc?: string | number;
  model?: string | number;
  product_identifiers?: { upc?: string | number; model?: string | number };
}

// Best-effort UPC/model enrichment for the top N products, in parallel batches.
// Checks the RetailerUpcCache before calling the detail actor — a cache HIT
// skips the actor entirely. All failures are swallowed so the product falls
// back to title matching. Metrics are accumulated into the provided accumulator.
async function enrichUpc(
  products:  RetailerProduct[],
  limit:     number,
  metrics:   UpcEnrichmentMetrics,
): Promise<void> {
  const targets = products.slice(0, limit).filter((p) => p.url);

  for (let i = 0; i < targets.length; i += UPC_CONCURRENCY) {
    const batch = targets.slice(i, i + UPC_CONCURRENCY);
    await Promise.all(batch.map(async (p) => {
      // ── Cache read ──────────────────────────────────────────────────────────
      const cached = await lookupUpcCache('Walmart', p.url);

      if (cached !== null) {
        if (cached.status === 'HIT' && isValidUpc(cached.upc)) {
          // Fresh HIT with valid UPC — use it, skip the actor
          p.upc   = cached.upc!;
          if (cached.model && !p.model) p.model = cached.model;
          metrics.upcCacheHits++;
          metrics.upcActorCallsAvoided++;
          return;
        }
        if (cached.status === 'MISS') {
          // Fresh MISS — item genuinely has no UPC; skip actor
          metrics.upcCacheMisses++;
          metrics.upcActorCallsAvoided++;
          return;
        }
        // HIT with invalid UPC (shouldn't happen due to write-side validation,
        // but handle defensively): fall through to actor call
      }

      // ── Actor call ──────────────────────────────────────────────────────────
      metrics.upcEnrichmentAttempted++;
      const url = p.url.split('?')[0]; // pratikdani fails on URL query params

      let writeStatus: 'HIT' | 'MISS' | 'FAILED' | 'TIMEOUT' = 'MISS';
      let writeUpc:    string | null = null;
      let writeModel:  string | null = null;
      let writeBrand:  string | null = null;
      let writeTitle:  string | null = null;
      let writeFailureReason: string | null = null;
      let isTimeout = false;

      try {
        const items = await runApifyActor<PratikItem>(UPC_ACTOR, { url }, UPC_TIMEOUT_MS);
        const it    = items[0];
        const rawUpc   = it?.upc   ?? it?.product_identifiers?.upc;
        const rawModel = it?.model ?? it?.product_identifiers?.model;

        const upcStr = rawUpc != null ? String(rawUpc) : null;
        if (isValidUpc(upcStr)) {
          p.upc = upcStr!;
          if (rawModel && !p.model) p.model = String(rawModel);
          writeStatus = 'HIT';
          writeUpc    = upcStr;
          writeModel  = rawModel != null ? String(rawModel) : null;
          writeBrand  = p.brand ?? null;
          writeTitle  = p.title ?? null;
          metrics.upcEnrichmentSucceeded++;
        } else {
          // Actor succeeded but no valid UPC in the response
          writeStatus = 'MISS';
          metrics.upcCacheMisses++;
        }
      } catch (err: unknown) {
        // Distinguish timeout from generic failure using the error message.
        // runApifyActor rejects with a generic Error; the timeout path inside
        // it produces a message containing "timed out" or "timeout".
        const msg = err instanceof Error ? err.message.toLowerCase() : '';
        isTimeout  = msg.includes('timeout') || msg.includes('timed out');

        if (isTimeout) {
          writeStatus = 'TIMEOUT';
          writeFailureReason = 'timeout';
          metrics.upcEnrichmentTimedOut++;
        } else {
          writeStatus = 'FAILED';
          writeFailureReason = err instanceof Error ? err.message.slice(0, 200) : 'unknown error';
          metrics.upcEnrichmentFailed++;
        }
      }

      // ── Cache write ─────────────────────────────────────────────────────────
      const wrote = await writeUpcCache('Walmart', p.url, {
        status:        writeStatus,
        upc:           writeUpc,
        model:         writeModel,
        brand:         writeBrand,
        title:         writeTitle,
        failureReason: writeFailureReason,
      });
      if (wrote) {
        metrics.upcCacheWrites++;
      } else if (writeStatus === 'HIT' || writeStatus === 'MISS') {
        // A false return from writeUpcCache on a non-error status means the write
        // was skipped (fresh HIT protection) or silently failed — count as failure
        // only when the write was genuinely attempted and returned false on error.
        // writeUpcCache returns false for "skipped to protect HIT" too — we cannot
        // distinguish here without a richer return, so we just don't increment.
      } else {
        metrics.upcCacheFailures++;
      }
    }));
  }
}

export class WalmartRetailer extends BaseRetailer {
  name         = 'Walmart';
  baseUrl      = 'https://www.walmart.com';
  supportsApi  = false;

  // Populated by the most recent search() call; consumed by run-scan.ts to
  // merge into ScanRunResult.upcEnrichmentMetrics.
  lastEnrichmentMetrics: UpcEnrichmentMetrics | null = null;

  async search(query: string, category?: string): Promise<RetailerProduct[]> {
    this.lastEnrichmentMetrics = null;
    try {
      const term = category ? `${query} ${category}` : query;
      const items = await runApifyActor<ApifyWalmartItem>(ACTOR_ID, {
        searchQueries: [term],
        maxProductsPerSearch: 50,
        maxSearchPages: 2,
      });

      const products = items
        .filter((item) => item.name && typeof item.price === 'number' && item.url)
        .map((item) => {
          const onSale = item.onSale ?? (typeof item.wasPrice === 'number' && item.wasPrice > (item.price ?? 0));
          return this.normalize({
            title:     item.name,
            brand:     item.brand || undefined,
            price:     item.price,
            listPrice: typeof item.wasPrice === 'number' && item.wasPrice > (item.price ?? 0) ? item.wasPrice : undefined,
            onSale,
            inStock:   true,
            url:       item.url,
            imageUrl:  item.thumbnail,
          });
        });

      // Prioritise on-sale items — that's where arbitrage margin lives.
      products.sort((a, b) => Number(b.onSale ?? false) - Number(a.onSale ?? false));

      // Cap to the best candidates so the downstream Amazon pipeline (several
      // SP-API calls per product) stays within the serverless time limit.
      const top = products.slice(0, MAX_PRODUCTS);

      // Enrich with UPC so matching can use exact barcodes. Metrics are
      // accumulated into a local object and stored on the instance so
      // run-scan.ts can merge them into ScanRunResult after search() returns.
      const enrichMetrics: UpcEnrichmentMetrics = {
        upcCacheHits: 0, upcCacheMisses: 0, upcCacheWrites: 0, upcCacheFailures: 0,
        upcActorCallsAvoided: 0, upcEnrichmentAttempted: 0, upcEnrichmentSucceeded: 0,
        upcEnrichmentFailed: 0, upcEnrichmentTimedOut: 0,
      };
      await enrichUpc(top, UPC_ENRICH_LIMIT, enrichMetrics);
      this.lastEnrichmentMetrics = enrichMetrics;

      return top;
    } catch (err) {
      console.error('[walmart] search error:', err);
      return [];
    }
  }

  async getProduct(): Promise<RetailerProduct | null> {
    // Not used by the current pipeline — search() returns enough data to
    // create leads. Add a detail-page actor call here if per-product lookups
    // (UPC, stock detail) become necessary.
    return null;
  }
}
