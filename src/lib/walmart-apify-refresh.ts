/**
 * walmart-apify-refresh.ts
 *
 * Thin wrapper around the existing pratikdani/walmart-product-scraper Apify actor
 * for known-product-URL price/availability refresh.
 *
 * Safety:
 * - NO DB writes. No Product, Lead, or LeadEntitlement records created.
 * - NO SP-API, Keepa, or direct Walmart HTTP calls.
 * - Silent actor failure (no product data returned) → available: null, NOT false.
 * - Missing price → null, NOT 0.
 * - Lead/Product freshnessStatus is NOT written here.
 */

import { runApifyActor } from '@/lib/apify';
import {
  isWalmartProductUrl,
  normalizeWalmartProductUrl,
  extractWalmartItemId,
} from '@/lib/walmart-product-refresh';

export const PRATIKDANI_ACTOR = 'pratikdani/walmart-product-scraper';
const DEFAULT_TIMEOUT_MS = 90_000;

// ---------------------------------------------------------------------------
// Result type — compatible with WalmartRefreshResult from walmart-product-refresh
// ---------------------------------------------------------------------------

export interface WalmartApifyRefreshResult {
  retailer: 'Walmart';
  retailerItemId: string | null;
  normalizedUrl: string;
  title: string | null;
  price: number | null;        // null = unknown, never 0 for "no price"
  available: boolean | null;   // null = unknown (actor failed), never false for parse failure
  sellerName: string | null;
  imageUrl: string | null;
  upc: string | null;
  brand: string | null;
  parseSource: 'apify-pratikdani';
  error: string | null;
  checkedAt: string;           // ISO-8601
}

// ---------------------------------------------------------------------------
// Actor response shape (95 fields confirmed in Phase 19.5A)
// ---------------------------------------------------------------------------

interface PratikdaniItem {
  // Pricing
  final_price?:    number;
  initial_price?:  number;
  sale_price?:     number | null;
  price?:          string | number; // "$8.84" or 8.84

  // Availability
  is_available?:   boolean;
  availability?:   string;          // "in_stock" | "out_of_stock" | ...

  // Identity
  product_name?:   string;
  product_id?:     string | number;
  upc?:            string | number;
  gtin?:           string | number;
  brand?:          string;

  // Media
  main_image?:     string;

  // Seller
  seller?:         string;

  // Echo fields — present on every response (including silent failures)
  input?:          { url?: string };
  timestamp?:      string;

  // Allow unknown additional fields
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseNumericPrice(raw: string | number | undefined | null): number | null {
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/[^0-9.]/g, ''));
  return isFinite(n) && n > 0 ? n : null;
}

function parseAvailability(item: PratikdaniItem): boolean | null {
  // Primary: boolean field
  if (typeof item.is_available === 'boolean') return item.is_available;

  // Fallback: string field
  if (typeof item.availability === 'string') {
    const s = item.availability.toLowerCase();
    if (s === 'in_stock' || s === 'instock') return true;
    if (s === 'out_of_stock' || s === 'outofstock') return false;
  }

  return null; // unknown — NOT treated as OOS
}

/**
 * Returns true if the actor response contains no product data —
 * only the echo fields (input, timestamp) that are always present.
 */
function isSilentFailure(item: PratikdaniItem): boolean {
  return !item.product_name && item.final_price === undefined && item.price === undefined;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function refreshWalmartProductUrlViaApify(
  url: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<WalmartApifyRefreshResult> {
  const normalizedUrl  = normalizeWalmartProductUrl(url);
  const retailerItemId = extractWalmartItemId(url);
  const checkedAt      = new Date().toISOString();

  // Reject non-Walmart URLs before spending an Apify call
  if (!isWalmartProductUrl(url)) {
    return {
      retailer:      'Walmart',
      retailerItemId,
      normalizedUrl,
      title:         null,
      price:         null,
      available:     null,
      sellerName:    null,
      imageUrl:      null,
      upc:           null,
      brand:         null,
      parseSource:   'apify-pratikdani',
      error:         `Not a valid Walmart product URL: ${url}`,
      checkedAt,
    };
  }

  let items: PratikdaniItem[];
  try {
    items = await runApifyActor<PratikdaniItem>(
      PRATIKDANI_ACTOR,
      { url: normalizedUrl },   // pratikdani fails on query params — normalizedUrl has none
      timeoutMs,
    );
  } catch (err) {
    return {
      retailer:      'Walmart',
      retailerItemId,
      normalizedUrl,
      title:         null,
      price:         null,
      available:     null,   // actor error ≠ OOS
      sellerName:    null,
      imageUrl:      null,
      upc:           null,
      brand:         null,
      parseSource:   'apify-pratikdani',
      error:         `Apify actor error: ${(err as Error).message}`,
      checkedAt,
    };
  }

  const item = items[0];

  // No items returned at all
  if (!item) {
    return {
      retailer:      'Walmart',
      retailerItemId,
      normalizedUrl,
      title:         null,
      price:         null,
      available:     null,
      sellerName:    null,
      imageUrl:      null,
      upc:           null,
      brand:         null,
      parseSource:   'apify-pratikdani',
      error:         'Actor returned empty dataset',
      checkedAt,
    };
  }

  // Silent failure — actor ran but returned only echo fields
  if (isSilentFailure(item)) {
    return {
      retailer:      'Walmart',
      retailerItemId: retailerItemId ?? (item.product_id != null ? String(item.product_id) : null),
      normalizedUrl,
      title:         null,
      price:         null,
      available:     null,   // unknown, NOT false
      sellerName:    null,
      imageUrl:      null,
      upc:           null,
      brand:         null,
      parseSource:   'apify-pratikdani',
      error:         'Actor returned no product data',
      checkedAt,
    };
  }

  // Successful response — map fields
  const price =
    parseNumericPrice(item.final_price) ??
    parseNumericPrice(item.price) ??
    null;

  const upc =
    item.upc  != null ? String(item.upc)  :
    item.gtin != null ? String(item.gtin) :
    null;

  return {
    retailer:       'Walmart',
    retailerItemId: item.product_id != null ? String(item.product_id) : retailerItemId,
    normalizedUrl,
    title:          typeof item.product_name === 'string' ? item.product_name : null,
    price,
    available:      parseAvailability(item),
    sellerName:     typeof item.seller === 'string' ? item.seller : null,
    imageUrl:       typeof item.main_image === 'string' ? item.main_image : null,
    upc,
    brand:          typeof item.brand === 'string' ? item.brand : null,
    parseSource:    'apify-pratikdani',
    error:          null,
    checkedAt,
  };
}
