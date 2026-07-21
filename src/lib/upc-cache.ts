/**
 * Retailer UPC enrichment cache helpers.
 *
 * Reads and writes the RetailerUpcCache table so repeated Walmart scans skip
 * the pratikdani/walmart-product-scraper detail actor when a fresh result is
 * already stored. All DB failures are swallowed — the cache is best-effort and
 * must never block a scan.
 *
 * Cache key strategy (per audit decision):
 *   Primary  — retailer + retailerItemId  (when extractable from URL)
 *   Fallback — retailer + normalizedSourceUrl
 */

import { prisma } from '@/lib/prisma';
import type { UpcCacheStatus } from '@prisma/client';

// ─── TTLs (ms) ───────────────────────────────────────────────────────────────

const TTL_HIT_MS     = 30 * 24 * 60 * 60 * 1000; // 30 days  — UPC is immutable
const TTL_MISS_MS    =  7 * 24 * 60 * 60 * 1000; //  7 days  — Walmart may add UPCs
const TTL_FAILURE_MS =  3 * 24 * 60 * 60 * 1000; //  3 days  — transient; retry soon

function ttlMs(status: UpcCacheStatus): number {
  switch (status) {
    case 'HIT':     return TTL_HIT_MS;
    case 'MISS':    return TTL_MISS_MS;
    case 'FAILED':
    case 'TIMEOUT': return TTL_FAILURE_MS;
  }
}

// ─── URL helpers ─────────────────────────────────────────────────────────────

/** Strip query params, lowercase, remove trailing slash. */
export function normalizeSourceUrl(url: string): string {
  return url.split('?')[0].toLowerCase().replace(/\/+$/, '');
}

/**
 * Extract the numeric Walmart item ID from a product URL.
 * Walmart URLs follow: https://www.walmart.com/ip/{slug}/{itemId}
 * The last path segment (before any query string) is the numeric item ID.
 * Returns undefined when the segment is not purely numeric.
 */
export function extractWalmartItemId(url: string): string | undefined {
  const clean = url.split('?')[0];
  const seg   = clean.split('/').filter(Boolean).pop() ?? '';
  return /^\d+$/.test(seg) ? seg : undefined;
}

// ─── UPC validation ───────────────────────────────────────────────────────────

/**
 * Returns true for valid UPC-E (8 digits), UPC-A (12 digits), or EAN-13 (13 digits).
 * Rejects empty strings, non-numeric, and lengths outside 8/12/13.
 */
export function isValidUpc(value: string | null | undefined): value is string {
  if (!value) return false;
  return /^\d{8}$|^\d{12}$|^\d{13}$/.test(value);
}

// ─── Cache lookup result ─────────────────────────────────────────────────────

export interface UpcCacheLookup {
  status:  UpcCacheStatus;
  upc:     string | null;
  ean:     string | null;
  model:   string | null;
  brand:   string | null;
  title:   string | null;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Look up a fresh cache entry for the given retailer URL.
 *
 * Returns the cached result when a non-expired entry exists, `null` otherwise.
 * FAILED and TIMEOUT entries return `null` so the caller retries the actor.
 * MISS entries return the MISS result so the caller skips the actor without a UPC.
 */
export async function lookupUpcCache(
  retailer: string,
  url: string,
): Promise<UpcCacheLookup | null> {
  const normalizedSourceUrl = normalizeSourceUrl(url);
  const retailerItemId      = extractWalmartItemId(url);
  const now                 = new Date();

  try {
    const row = await prisma.retailerUpcCache.findFirst({
      where: {
        retailer,
        OR: [
          ...(retailerItemId ? [{ retailerItemId }] : []),
          { normalizedSourceUrl },
        ],
        expiresAt: { gt: now },
      },
      // When both keys match (unlikely but possible), prefer itemId match —
      // orderBy ensures a non-null retailerItemId row sorts first.
      orderBy: { retailerItemId: { sort: 'asc', nulls: 'last' } },
    });

    if (!row) return null;

    // FAILED / TIMEOUT: caller should retry the actor
    if (row.status === 'FAILED' || row.status === 'TIMEOUT') return null;

    return {
      status: row.status,
      upc:    row.upc,
      ean:    row.ean,
      model:  row.model,
      brand:  row.brand,
      title:  row.title,
    };
  } catch {
    return null; // DB error — treat as cold cache, let caller proceed normally
  }
}

export interface UpcCacheWriteInput {
  status:        UpcCacheStatus;
  upc?:          string | null;
  ean?:          string | null;
  model?:        string | null;
  brand?:        string | null;
  title?:        string | null;
  failureReason?: string | null;
}

/**
 * Write (upsert) a cache entry for the given retailer URL.
 *
 * Safety rules:
 * - A fresh valid HIT is never overwritten by MISS/FAILED/TIMEOUT.
 * - Malformed UPCs are coerced to null before writing.
 * - All DB errors are swallowed; the function never throws.
 *
 * Returns true when the write succeeded, false on any error or skipped write.
 */
export async function writeUpcCache(
  retailer: string,
  url: string,
  input: UpcCacheWriteInput,
): Promise<boolean> {
  const normalizedSourceUrl = normalizeSourceUrl(url);
  const retailerItemId      = extractWalmartItemId(url);
  const now                 = new Date();
  const expiresAt           = new Date(now.getTime() + ttlMs(input.status));
  const upc                 = isValidUpc(input.upc ?? null) ? (input.upc ?? null) : null;

  // Do not overwrite a fresh valid HIT with a negative result
  if (input.status !== 'HIT') {
    try {
      const existing = await prisma.retailerUpcCache.findFirst({
        where: {
          retailer,
          OR: [
            ...(retailerItemId ? [{ retailerItemId }] : []),
            { normalizedSourceUrl },
          ],
          status:    'HIT',
          expiresAt: { gt: now },
        },
        select: { id: true },
      });
      if (existing) return false; // protect fresh HIT
    } catch {
      return false;
    }
  }

  const data = {
    retailer,
    retailerItemId:      retailerItemId ?? null,
    normalizedSourceUrl,
    upc,
    ean:           input.ean   ?? null,
    model:         input.model ?? null,
    brand:         input.brand ?? null,
    title:         input.title ?? null,
    status:        input.status,
    failureReason: input.failureReason ?? null,
    fetchedAt:     now,
    expiresAt,
  };

  try {
    let result: unknown;
    if (retailerItemId) {
      // Primary upsert path — conflict on retailer + retailerItemId
      result = await prisma.retailerUpcCache.upsert({
        where:  { retailer_retailerItemId: { retailer, retailerItemId } },
        create: data,
        update: {
          normalizedSourceUrl,
          upc,
          ean:           data.ean,
          model:         data.model,
          brand:         data.brand,
          title:         data.title,
          status:        data.status,
          failureReason: data.failureReason,
          fetchedAt:     data.fetchedAt,
          expiresAt:     data.expiresAt,
        },
      }).catch(() => null);
    } else {
      // Fallback upsert path — conflict on retailer + normalizedSourceUrl
      result = await prisma.retailerUpcCache.upsert({
        where:  { retailer_normalizedSourceUrl: { retailer, normalizedSourceUrl } },
        create: data,
        update: {
          upc,
          ean:           data.ean,
          model:         data.model,
          brand:         data.brand,
          title:         data.title,
          status:        data.status,
          failureReason: data.failureReason,
          fetchedAt:     data.fetchedAt,
          expiresAt:     data.expiresAt,
        },
      }).catch(() => null);
    }
    return result !== null;
  } catch {
    return false;
  }
}
