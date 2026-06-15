import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@lib/prisma';
import { runPricingEngine } from '@server/services/ai/pricing-engine';
import { submitPriceChange, type AmazonConnection } from '@server/services/amazon/repricer';
import type { SellerListing, RepricingStrategy } from '@lib/types';

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    const userId = (session.user as { id: string }).id;
    const body = await req.json();

    // listing data + optional SP-API credentials
    const { listing, ruleId, demo, clientId, clientSecret, refreshToken, sellerId, marketplaceId } = body as {
      listing: SellerListing;
      ruleId?: string;
      demo?: boolean;
      clientId?: string;
      clientSecret?: string;
      refreshToken?: string;
      sellerId?: string;
      marketplaceId?: string;
    };

    // Load rule — either by id or create a sensible default
    let rule = ruleId ? await prisma.repricerRule.findFirst({ where: { id: ruleId, userId } }) : null;

    if (!rule) {
      // No saved rule yet — use sensible defaults based on listing
      rule = {
        id: '',
        userId,
        asin: listing.asin,
        sku: listing.sku,
        productName: listing.productName,
        minPrice: Math.round(listing.currentPrice * 0.85 * 100) / 100,
        maxPrice: Math.round(listing.currentPrice * 1.15 * 100) / 100,
        strategy: 'WIN_BUY_BOX',
        targetMargin: null,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    const decision = runPricingEngine(listing, {
      minPrice: rule.minPrice,
      maxPrice: rule.maxPrice,
      strategy: rule.strategy as RepricingStrategy,
      targetMargin: rule.targetMargin ?? undefined,
    });

    // Submit to Amazon only when connected (not demo)
    let submitted = false;
    if (!demo && clientId && clientSecret && refreshToken && sellerId) {
      const conn: AmazonConnection = { clientId, clientSecret, refreshToken, sellerId, marketplaceId: marketplaceId ?? 'ATVPDKIKX0DER' };
      submitted = await submitPriceChange(conn, listing.sku, decision.recommendedPrice);
    } else {
      submitted = true; // demo: simulate success
    }

    // Persist log
    if (submitted) {
      await prisma.repricerLog.create({
        data: {
          userId,
          ruleId: rule.id || null,
          asin: listing.asin,
          sku: listing.sku,
          productName: listing.productName,
          oldPrice: listing.currentPrice,
          newPrice: decision.recommendedPrice,
          strategy: rule.strategy,
          reason: decision.reason,
          action: decision.action,
          competitorPrice: listing.lowestFbaPrice ?? undefined,
          buyBoxPrice: listing.buyBoxPrice ?? undefined,
        },
      });
    }

    return NextResponse.json({ success: true, data: { decision, submitted } });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}
