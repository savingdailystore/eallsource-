/**
 * walmart-product-refresh.ts
 *
 * In-house Walmart known-product-URL refresher.
 * Fetches a Walmart product page by URL and parses current price/availability.
 *
 * Safety:
 * - NO DB writes. No Product, Lead, or LeadEntitlement records created.
 * - NO SP-API, Keepa, or Apify calls.
 * - Parse failure returns available: null (unknown) — never treated as OOS.
 * - Lead/Product freshnessStatus is NOT written here.
 */

export interface WalmartRefreshResult {
  retailer: 'Walmart';
  retailerItemId: string | null;
  normalizedUrl: string;
  title: string | null;
  price: number | null;
  available: boolean | null; // null = unknown (parse failure)
  sellerName: string | null;
  imageUrl: string | null;
  parseSource: 'NEXT_DATA' | 'JSON_LD' | 'META' | null;
  error: string | null;
  checkedAt: string; // ISO-8601
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

const WALMART_ITEM_RE = /\/ip\/(?:[^/]+\/)?(\d+)(?:[/?#]|$)/;
const WALMART_HOST_RE = /^(?:www\.)?walmart\.com$/i;

export function isWalmartProductUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return WALMART_HOST_RE.test(u.hostname) && WALMART_ITEM_RE.test(u.pathname);
  } catch {
    return false;
  }
}

export function normalizeWalmartProductUrl(url: string): string {
  try {
    const u = new URL(url);
    // Keep only the canonical /ip/… path, no query string or hash
    const match = WALMART_ITEM_RE.exec(u.pathname);
    if (!match) return url;
    return `https://www.walmart.com/ip/${match[1]}`;
  } catch {
    return url;
  }
}

export function extractWalmartItemId(url: string): string | null {
  try {
    const u = new URL(url);
    const match = WALMART_ITEM_RE.exec(u.pathname);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// HTML parsing helpers
// ---------------------------------------------------------------------------

interface ParsedProduct {
  title: string | null;
  price: number | null;
  available: boolean | null;
  sellerName: string | null;
  imageUrl: string | null;
  parseSource: 'NEXT_DATA' | 'JSON_LD' | 'META' | null;
  error: string | null;
}

function parsePrice(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/[^0-9.]/g, ''));
  return isFinite(n) && n > 0 ? n : null;
}

function parseAvailability(raw: unknown): boolean | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).toLowerCase();
  if (s.includes('instock') || s.includes('in_stock') || s.includes('in stock')) return true;
  if (
    s.includes('outofstock') ||
    s.includes('out_of_stock') ||
    s.includes('out of stock') ||
    s === 'false'
  ) return false;
  return null; // ambiguous — treat as unknown, not OOS
}

// Extract the first <script id="__NEXT_DATA__"> JSON blob
function tryNextData(html: string): ParsedProduct | null {
  const scriptMatch = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!scriptMatch) return null;

  let root: Record<string, unknown>;
  try {
    root = JSON.parse(scriptMatch[1]);
  } catch {
    return null;
  }

  // Walk common Walmart page structures
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const props: any =
    (root as any)?.props?.pageProps?.initialData?.data?.product ??
    (root as any)?.props?.pageProps?.initialData?.data?.idml ??
    (root as any)?.props?.pageProps?.product ??
    null;

  if (!props) return null;

  // Price: priceInfo.currentPrice.price or offers[0].price
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priceRaw: any =
    props?.priceInfo?.currentPrice?.price ??
    props?.priceInfo?.priceRange?.minPrice ??
    props?.offers?.[0]?.price ??
    null;

  // Availability
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const availRaw: any =
    props?.availabilityStatus ??
    props?.availability ??
    props?.offers?.[0]?.availability ??
    null;

  // Explicit OOS signals in Walmart's __NEXT_DATA__
  let available: boolean | null = null;
  if (availRaw !== null && availRaw !== undefined) {
    const s = String(availRaw).toLowerCase();
    if (s === 'in_stock' || s === 'available' || s === 'true') available = true;
    else if (s === 'out_of_stock' || s === 'unavailable' || s === 'false') available = false;
    // anything else → null (unknown)
  }

  const title: string | null = props?.name ?? props?.title ?? null;
  const sellerName: string | null = props?.sellerName ?? props?.seller?.sellerName ?? null;
  const imageUrl: string | null =
    props?.imageInfo?.thumbnailUrl ??
    props?.images?.[0]?.url ??
    null;

  return {
    title: typeof title === 'string' ? title : null,
    price: parsePrice(priceRaw),
    available,
    sellerName: typeof sellerName === 'string' ? sellerName : null,
    imageUrl: typeof imageUrl === 'string' ? imageUrl : null,
    parseSource: 'NEXT_DATA',
    error: null,
  };
}

// Extract price/availability from JSON-LD <script type="application/ld+json"> blocks
function tryJsonLd(html: string): ParsedProduct | null {
  const blocks: string[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    blocks.push(m[1]);
  }
  if (blocks.length === 0) return null;

  for (const block of blocks) {
    let ld: unknown;
    try {
      ld = JSON.parse(block);
    } catch {
      continue; // malformed block — skip, don't fail
    }

    // Handle @graph arrays
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candidates: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ldAny = ld as any;
    if (Array.isArray(ldAny)) {
      candidates.push(...ldAny);
    } else if (ldAny?.['@graph'] && Array.isArray(ldAny['@graph'])) {
      candidates.push(...ldAny['@graph']);
    } else {
      candidates.push(ldAny);
    }

    for (const node of candidates) {
      if (!node || (node['@type'] !== 'Product' && node['@type'] !== 'Offer')) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const offer: any = node.offers ?? (node['@type'] === 'Offer' ? node : null);
      const offerNode = Array.isArray(offer) ? offer[0] : offer;

      const priceRaw = offerNode?.price ?? offerNode?.lowPrice ?? null;
      const availRaw = offerNode?.availability ?? null;
      const title: string | null = node.name ?? null;
      const imageUrl: string | null =
        typeof node.image === 'string'
          ? node.image
          : Array.isArray(node.image)
          ? node.image[0]
          : node.image?.url ?? null;

      return {
        title: typeof title === 'string' ? title : null,
        price: parsePrice(priceRaw),
        available: parseAvailability(availRaw),
        sellerName: offerNode?.seller?.name ?? null,
        imageUrl: typeof imageUrl === 'string' ? imageUrl : null,
        parseSource: 'JSON_LD',
        error: null,
      };
    }
  }

  return null;
}

// Last-resort: og:title, og:image, product:price:amount meta tags
function tryMetaTags(html: string): ParsedProduct | null {
  const getMeta = (property: string): string | null => {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
      'i',
    );
    const m = re.exec(html);
    if (m) return m[1];
    // also try content before property
    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
      'i',
    );
    const m2 = re2.exec(html);
    return m2 ? m2[1] : null;
  };

  const title = getMeta('og:title') ?? getMeta('title');
  const priceRaw = getMeta('product:price:amount') ?? getMeta('og:price:amount');
  const imageUrl = getMeta('og:image');

  if (!title && !priceRaw) return null;

  return {
    title: title ?? null,
    price: parsePrice(priceRaw),
    available: null, // meta tags don't reliably encode availability
    sellerName: null,
    imageUrl: imageUrl ?? null,
    parseSource: 'META',
    error: null,
  };
}

export function parseWalmartProductHtml(html: string, url: string): WalmartRefreshResult {
  const normalizedUrl = normalizeWalmartProductUrl(url);
  const retailerItemId = extractWalmartItemId(url);
  const checkedAt = new Date().toISOString();

  const parsed =
    tryNextData(html) ??
    tryJsonLd(html) ??
    tryMetaTags(html) ??
    null;

  if (!parsed) {
    return {
      retailer: 'Walmart',
      retailerItemId,
      normalizedUrl,
      title: null,
      price: null,
      available: null, // unknown — NOT treated as out of stock
      sellerName: null,
      imageUrl: null,
      parseSource: null,
      error: 'Unable to parse product data from page HTML',
      checkedAt,
    };
  }

  return {
    retailer: 'Walmart',
    retailerItemId,
    normalizedUrl,
    ...parsed,
    checkedAt,
  };
}

// ---------------------------------------------------------------------------
// Fetch wrapper
// ---------------------------------------------------------------------------

const FETCH_TIMEOUT_MS = 15_000;

const SAFE_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

export async function refreshWalmartProductUrl(url: string): Promise<WalmartRefreshResult> {
  const normalizedUrl = normalizeWalmartProductUrl(url);
  const retailerItemId = extractWalmartItemId(url);
  const checkedAt = new Date().toISOString();

  if (!isWalmartProductUrl(url)) {
    return {
      retailer: 'Walmart',
      retailerItemId,
      normalizedUrl,
      title: null,
      price: null,
      available: null,
      sellerName: null,
      imageUrl: null,
      parseSource: null,
      error: `Not a valid Walmart product URL: ${url}`,
      checkedAt,
    };
  }

  let html: string;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(normalizedUrl, {
        headers: SAFE_HEADERS,
        signal: controller.signal,
      });
      if (!res.ok) {
        return {
          retailer: 'Walmart',
          retailerItemId,
          normalizedUrl,
          title: null,
          price: null,
          available: null, // HTTP error ≠ OOS
          sellerName: null,
          imageUrl: null,
          parseSource: null,
          error: `HTTP ${res.status} from Walmart`,
          checkedAt,
        };
      }
      html = await res.text();
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    return {
      retailer: 'Walmart',
      retailerItemId,
      normalizedUrl,
      title: null,
      price: null,
      available: null, // network error ≠ OOS
      sellerName: null,
      imageUrl: null,
      parseSource: null,
      error: `Fetch error: ${(err as Error).message}`,
      checkedAt,
    };
  }

  return parseWalmartProductHtml(html, url);
}
