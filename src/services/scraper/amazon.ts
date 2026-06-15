/**
 * Amazon search-page scraper — Phase 1
 * Uses Playwright/Chromium. Only imported in worker context, never in Next.js.
 */

import { chromium } from 'playwright';

export interface ScrapedProduct {
  asin: string;
  title: string;
  url: string;
  imageUrl?: string;
  price?: number;
  rating?: number;
  reviewCount?: number;
  bsr?: number;
  isPrime: boolean;
  category?: string;
  raw: Record<string, unknown>;
}

const AMAZON_BASE = 'https://www.amazon.com';

// Realistic browser fingerprint
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function scrapeAmazonSearch(
  query: string,
  maxResults = 20,
): Promise<ScrapedProduct[]> {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    },
  });

  // Remove automation indicators
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    // @ts-ignore
    delete window.chrome;
  });

  const page = await context.newPage();

  try {
    const searchUrl = `${AMAZON_BASE}/s?k=${encodeURIComponent(query)}&ref=nb_sb_noss`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // CAPTCHA detection
    const title = await page.title();
    if (title.toLowerCase().includes('robot check') || title.toLowerCase().includes('captcha')) {
      throw new Error('Amazon CAPTCHA detected — retry later or use a proxy');
    }

    // Wait for search results
    await page.waitForSelector('[data-component-type="s-search-result"]', {
      timeout: 15_000,
    }).catch(() => null);

    // Small human-like pause
    await delay(800 + Math.random() * 600);

    const products = await page.evaluate((base: string) => {
      const cards = Array.from(
        document.querySelectorAll('[data-component-type="s-search-result"]'),
      );

      return cards.map((card) => {
        const asin = card.getAttribute('data-asin') ?? '';
        if (!asin) return null;

        // Title
        const titleEl =
          card.querySelector('h2 .a-link-normal .a-text-normal') ??
          card.querySelector('h2 a span') ??
          card.querySelector('h2 span');
        const title = titleEl?.textContent?.trim() ?? '';

        // URL
        const linkEl = card.querySelector('h2 .a-link-normal') as HTMLAnchorElement | null;
        const href = linkEl?.getAttribute('href') ?? '';
        const url = href.startsWith('http') ? href : `${base}${href}`;

        // Image
        const imgEl = card.querySelector('img.s-image') as HTMLImageElement | null;
        const imageUrl = imgEl?.src ?? undefined;

        // Price — first .a-offscreen inside .a-price
        const priceEl = card.querySelector('.a-price .a-offscreen');
        const priceText = priceEl?.textContent?.replace(/[^0-9.]/g, '') ?? '';
        const price = priceText ? parseFloat(priceText) : undefined;

        // Rating
        const ratingEl = card.querySelector('[data-cy="reviews-block"] .a-icon-alt') ??
          card.querySelector('.a-icon-star-small .a-icon-alt') ??
          card.querySelector('.a-icon-alt');
        const ratingText = ratingEl?.textContent ?? '';
        const ratingMatch = ratingText.match(/(\d+\.?\d*)\s+out/);
        const rating = ratingMatch ? parseFloat(ratingMatch[1]) : undefined;

        // Review count
        const reviewEl =
          card.querySelector('[data-cy="reviews-block"] .s-underline-text') ??
          card.querySelector('span[aria-label*="rating"]') ??
          card.querySelector('.s-link-style .a-size-base');
        const reviewText = reviewEl?.textContent?.replace(/[^0-9]/g, '') ?? '';
        const reviewCount = reviewText ? parseInt(reviewText, 10) : undefined;

        // Prime badge
        const isPrime = !!card.querySelector('[aria-label="Amazon Prime"]') ||
          !!card.querySelector('.s-prime') ||
          !!card.querySelector('[data-cy="prime-logo"]');

        return {
          asin,
          title,
          url,
          imageUrl: imageUrl ?? null,
          price: price ?? null,
          rating: rating ?? null,
          reviewCount: reviewCount ?? null,
          isPrime,
          raw: { href, priceText, ratingText },
        };
      }).filter(Boolean);
    }, AMAZON_BASE);

    const results: ScrapedProduct[] = (products as Awaited<typeof products>)
      .filter((p): p is NonNullable<typeof p> => p !== null && !!p.asin && !!p.title)
      .slice(0, maxResults)
      .map((p) => ({
        asin: p.asin,
        title: p.title,
        url: p.url,
        imageUrl: p.imageUrl ?? undefined,
        price: p.price ?? undefined,
        rating: p.rating ?? undefined,
        reviewCount: p.reviewCount ?? undefined,
        isPrime: p.isPrime,
        raw: p.raw as Record<string, unknown>,
      }));

    return results;
  } finally {
    await browser.close();
  }
}

export async function scrapeAmazonProduct(asin: string): Promise<Partial<ScrapedProduct> | null> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
  });

  const page = await context.newPage();

  try {
    const url = `${AMAZON_BASE}/dp/${asin}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    const title = await page.title();
    if (title.toLowerCase().includes('robot check')) {
      throw new Error('Amazon CAPTCHA detected');
    }

    await delay(500 + Math.random() * 500);

    const data = await page.evaluate(() => {
      // BSR
      const bsrEl = document.querySelector('#SalesRank, #detailBulletsWrapper_feature_div');
      const bsrText = bsrEl?.textContent ?? '';
      const bsrMatch = bsrText.match(/#([\d,]+)/);
      const bsr = bsrMatch ? parseInt(bsrMatch[1].replace(/,/g, ''), 10) : null;

      // Price
      const priceEl =
        document.querySelector('.a-price.priceToPay .a-offscreen') ??
        document.querySelector('#price_inside_buybox') ??
        document.querySelector('#priceblock_ourprice');
      const priceText = priceEl?.textContent?.replace(/[^0-9.]/g, '') ?? '';
      const price = priceText ? parseFloat(priceText) : null;

      // Category
      const catEl = document.querySelector('#wayfinding-breadcrumbs_feature_div');
      const category = catEl?.textContent?.trim().split('\n').map((s) => s.trim()).filter(Boolean).join(' > ') ?? null;

      return { bsr, price, category };
    });

    return {
      asin,
      url,
      bsr: data.bsr ?? undefined,
      price: data.price ?? undefined,
      category: data.category ?? undefined,
    };
  } catch {
    return null;
  } finally {
    await browser.close();
  }
}
