import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getSpApiClient } from '@/lib/sp-api';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface FbaInventorySummary {
  asin:          string;
  fnSku?:        string;
  sellerSku?:    string;
  productName?:  string;
  totalQuantity?: number;
  inventoryDetails?: {
    fulfillableQuantity?:        number;
    inboundWorkingQuantity?:     number;
    inboundShippedQuantity?:     number;
    inboundReceivingQuantity?:   number;
    reservedQuantity?: {
      totalReservedQuantity?:    number;
    };
  };
}

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orgId = session.user.orgId;

  try {
    const client = await getSpApiClient(orgId);

    // Fetch all FBA inventory summaries
    let allItems: FbaInventorySummary[] = [];
    let nextToken: string | undefined;

    do {
      const query: Record<string, string> = {
        granularityType: 'Marketplace',
        granularityId:   client.marketplaceId,
        marketplaceIds:  client.marketplaceId,   // required by getInventorySummaries
        details:         'true',
      };
      if (nextToken) query.nextToken = nextToken;

      const data = await client.get('/fba/inventory/v1/summaries', query);
      const summaries: FbaInventorySummary[] = data?.payload?.inventorySummaries ?? [];
      allItems = [...allItems, ...summaries];
      nextToken = data?.pagination?.nextToken;
    } while (nextToken);

    if (allItems.length === 0) {
      return NextResponse.json({ synced: 0, message: 'No FBA inventory found in Seller Central.' });
    }

    // Upsert into inventory table
    let synced = 0;
    for (const item of allItems) {
      if (!item.asin) continue;

      const d         = item.inventoryDetails ?? {};
      const available = d.fulfillableQuantity ?? 0;
      const reserved  = d.reservedQuantity?.totalReservedQuantity ?? 0;
      const inbound   = (d.inboundWorkingQuantity ?? 0) + (d.inboundShippedQuantity ?? 0) + (d.inboundReceivingQuantity ?? 0);
      const total     = item.totalQuantity ?? available + reserved + inbound;

      const data = {
        sku:               item.sellerSku ?? null,
        fnsku:             item.fnSku ?? null,
        productName:       item.productName ?? item.sellerSku ?? item.asin,
        availableQuantity: available,
        reservedQuantity:  reserved,
        inboundQuantity:   inbound,
        totalQuantity:     total,
      };

      await prisma.inventoryItem.upsert({
        where:  { orgId_asin: { orgId, asin: item.asin } },
        create: { orgId, asin: item.asin, ...data },
        update: data,
      });
      synced++;
    }

    return NextResponse.json({ synced, total: allItems.length });

  } catch (err: any) {
    const msg = err?.message ?? 'Unknown error';

    if (msg.includes('env vars not set')) {
      return NextResponse.json({ error: 'missing_env', message: msg }, { status: 503 });
    }
    if (msg.includes('not connected')) {
      return NextResponse.json({ error: 'not_connected' }, { status: 400 });
    }

    return NextResponse.json({ error: 'sp_api_error', message: msg }, { status: 502 });
  }
}
