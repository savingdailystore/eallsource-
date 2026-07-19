import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { processRetailerProduct } from '@/services/pipeline';
import { getCurrentDeliveryWeekStart, getWeeklyLeadUsage } from '@/lib/lead-delivery';
import { PLAN_LIMITS } from '@/types';
import type { Plan } from '@/types';
import type { RetailerProduct } from '@/types';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const schema = z.object({
  amazonUrl:   z.string().url(),
  retailerUrl: z.string().url(),
  retailer:    z.string().min(1).max(40),
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

// Manually add a product to the lead feed from an Amazon + retailer link.
// Accessible to OWNER and users with the canManualLead permission.
// The pipeline auto-fills all market data, fees, gating, and profitability;
// `force` means the deliberately-chosen product is never rejected by the gates.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Re-read canManualLead from DB so revocation takes effect immediately
  // rather than waiting for the 8-hour JWT to expire.
  const isOwner = session.user.role === 'OWNER';
  if (!isOwner) {
    const dbUser = await prisma.user.findUnique({
      where:  { id: session.user.id },
      select: { canManualLead: true },
    });
    if (!dbUser?.canManualLead) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const { amazonUrl, retailerUrl, retailer, sourcePrice, title, upc, notes } = parsed.data;

  const asin = extractAsin(amazonUrl);
  if (!asin) {
    return NextResponse.json({ error: "Couldn't find an ASIN in that Amazon link. Use the full product URL (it contains /dp/...)." }, { status: 400 });
  }

  const orgId = session.user.orgId;

  // Load org details once — needed for both the source-org broadcast path and
  // the customer-org quota path.
  const org = await prisma.organization.findUnique({
    where:  { id: orgId },
    select: { isBroadcastSource: true, plan: true },
  });

  // Customer orgs: enforce weekly limit BEFORE creating the lead so no orphaned
  // leads are left if the quota check would have blocked the request.
  const weekStart = getCurrentDeliveryWeekStart();
  if (!org?.isBroadcastSource) {
    const plan      = (org?.plan ?? 'STARTER') as Plan;
    const used      = await getWeeklyLeadUsage(orgId, weekStart);
    const remaining = Math.max(0, PLAN_LIMITS[plan].leadsPerWeek - used);
    if (remaining === 0) {
      return NextResponse.json({
        error: 'Weekly lead limit reached. Your lead capacity refreshes on the next Monday drop (Monday 6:00 AM Arizona time).',
      }, { status: 429 });
    }
  }

  // Any retailer name is allowed for manual entry — it's just the source label
  // (Chewy, CVS, GameStop, …). We don't scrape it; the Amazon side auto-fills.
  const product: RetailerProduct = {
    title:    title?.trim() ?? '',
    price:    sourcePrice,
    url:      retailerUrl,
    retailer: retailer.trim(),
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

  if (result.outcome === 'lead_created' || result.outcome === 'lead_updated') {
    const leadId = (result as { leadId: string }).leadId;

    if (org?.isBroadcastSource) {
      // Source org: lead is added to the internal source pool and will be eligible
      // for the next scheduled weekly drop. No immediate broadcast to customers.
      // Owner-curated grants to specific orgs are handled in Phase 14.8d.
    } else {
      // Customer org: private lead — create CUSTOMER_MANUAL entitlement for submitter
      await prisma.leadEntitlement.upsert({
        where:  { orgId_leadId: { orgId, leadId } },
        create: {
          orgId,
          leadId,
          deliverySource:          'CUSTOMER_MANUAL',
          countsTowardWeeklyLimit: true,
          leadTierAtDelivery:      'BASIC',
          deliveryWeekStart:       weekStart,
          deliveredAt:             new Date(),
        },
        update: {},
      });
    }
  }

  return NextResponse.json({
    ok: true,
    outcome: result.outcome,
    leadId:  'leadId' in result ? result.leadId : null,
    score:   'score'  in result ? result.score  : null,
    asin,
  });
}
