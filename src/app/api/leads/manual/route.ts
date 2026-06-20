import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { processRetailerProduct } from '@/services/pipeline';
import { broadcastLeads } from '@/services/broadcast';
import { getRetailerNames } from '@/retailers';
import type { RetailerProduct } from '@/types';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const schema = z.object({
  amazonUrl:   z.string().url(),
  retailerUrl: z.string().url(),
  retailer:    z.string().min(1),
  sourcePrice: z.number().positive(),
  title:       z.string().max(300).optional(),
  upc:         z.string().max(20).optional(),
  notes:       z.string().max(1000).optional(),
});

// Pull a 10-char ASIN out of an Amazon URL: /dp/XXXX, /gp/product/XXXX, ?asin=, etc.
function extractAsin(url: string): string | null {
  const patterns = [
    /\/(?:dp|gp\/product|gp\/aw\/d|product)\/([A-Z0-9]{10})/i,
    /[?&]asin=([A-Z0-9]{10})/i,
    /\/([A-Z0-9]{10})(?:[/?]|$)/i,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1].toUpperCase();
  }
  return null;
}

// Owner-only: manually add a product to the lead feed from an Amazon + retailer
// link. The pipeline auto-fills all market data, fees, gating, and profitability;
// `force` means the deliberately-chosen product is never rejected by the gates.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'OWNER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const { amazonUrl, retailerUrl, retailer, sourcePrice, title, upc, notes } = parsed.data;

  const asin = extractAsin(amazonUrl);
  if (!asin) {
    return NextResponse.json({ error: "Couldn't find an ASIN in that Amazon link. Use the full product URL (it contains /dp/...)." }, { status: 400 });
  }

  if (!getRetailerNames().includes(retailer)) {
    return NextResponse.json({ error: `Unknown retailer: ${retailer}` }, { status: 400 });
  }

  const orgId = session.user.orgId;

  const product: RetailerProduct = {
    title:    title?.trim() ?? '',
    price:    sourcePrice,
    url:      retailerUrl,
    retailer,
    inStock:  true,
    upc:      upc?.trim() || undefined,
  };

  const result = await processRetailerProduct(product, orgId, { knownAsin: asin, force: true, notes });

  if (result.outcome === 'no_match' || result.outcome === 'no_amazon_data') {
    return NextResponse.json({
      error: `Couldn't pull Amazon market data for ASIN ${asin} (no buy box / FBA price). Double-check the Amazon link, or try again in a moment.`,
    }, { status: 422 });
  }
  if (result.outcome === 'error') {
    return NextResponse.json({ error: 'Something went wrong building the lead. Please try again.' }, { status: 500 });
  }

  // Fan the new lead out to subscriber orgs if this is the broadcast source.
  let broadcast = 0;
  if (result.outcome === 'lead_created' || result.outcome === 'lead_updated') {
    const org = await prisma.organization.findUnique({
      where: { id: orgId }, select: { isBroadcastSource: true },
    });
    if (org?.isBroadcastSource) {
      broadcast = await broadcastLeads(orgId, [result.leadId]).catch((err) => {
        console.error('[manual-lead] broadcast failed:', err);
        return 0;
      });
    }
  }

  return NextResponse.json({
    ok: true,
    outcome:   result.outcome,
    leadId:    'leadId' in result ? result.leadId : null,
    score:     'score'  in result ? result.score  : null,
    asin,
    broadcast,
  });
}
