// Amazon SP-API — FBA Inventory Summaries
// https://developer-docs.amazon.com/sp-api/docs/fba-inventory-api-v1-reference

const SP_API_BASE = 'https://sellingpartnerapi-na.amazon.com';

export interface InventoryItem {
  asin: string;
  fnSku: string;
  sellerSku: string;
  productName: string;
  condition: string;
  inventoryDetails: {
    fulfillableQuantity: number;
    inboundWorkingQuantity: number;
    inboundShippedQuantity: number;
    inboundReceivingQuantity: number;
    reservedQuantity: {
      totalReservedQuantity: number;
      pendingCustomerOrderQuantity: number;
      pendingTransshipmentQuantity: number;
      fcProcessingQuantity: number;
    };
    researchingQuantity: number;
    unfulfillableQuantity: number;
  };
  lastUpdatedTime: string;
  totalQuantity: number;
}

export interface InventoryConnection {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  marketplaceId: string;
}

// Fetch a fresh access token using stored credentials
async function getAccessToken(conn: InventoryConnection): Promise<string> {
  const res = await fetch('https://api.amazon.com/auth/o2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: conn.clientId,
      client_secret: conn.clientSecret,
      refresh_token: conn.refreshToken,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Amazon auth failed: ${body}`);
  }

  const data = await res.json();
  return data.access_token as string;
}

export async function fetchInventory(conn: InventoryConnection): Promise<InventoryItem[]> {
  const token = await getAccessToken(conn);

  const url = new URL(`${SP_API_BASE}/fba/inventory/v1/summaries`);
  url.searchParams.set('details', 'true');
  url.searchParams.set('granularityType', 'Marketplace');
  url.searchParams.set('granularityId', conn.marketplaceId);
  url.searchParams.set('marketplaceIds', conn.marketplaceId);

  const res = await fetch(url.toString(), {
    headers: {
      'x-amz-access-token': token,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Inventory fetch failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  const summaries = data.payload?.inventorySummaries ?? [];

  return summaries.map((s: Record<string, unknown>) => {
    const details = (s.inventoryDetails ?? {}) as Record<string, unknown>;
    const reserved = (details.reservedQuantity ?? {}) as Record<string, number>;

    return {
      asin: s.asin as string,
      fnSku: s.fnSku as string,
      sellerSku: s.sellerSku as string,
      productName: s.productName as string ?? '—',
      condition: s.condition as string ?? 'NewItem',
      inventoryDetails: {
        fulfillableQuantity: (details.fulfillableQuantity as number) ?? 0,
        inboundWorkingQuantity: (details.inboundWorkingQuantity as number) ?? 0,
        inboundShippedQuantity: (details.inboundShippedQuantity as number) ?? 0,
        inboundReceivingQuantity: (details.inboundReceivingQuantity as number) ?? 0,
        reservedQuantity: {
          totalReservedQuantity: reserved.totalReservedQuantity ?? 0,
          pendingCustomerOrderQuantity: reserved.pendingCustomerOrderQuantity ?? 0,
          pendingTransshipmentQuantity: reserved.pendingTransshipmentQuantity ?? 0,
          fcProcessingQuantity: reserved.fcProcessingQuantity ?? 0,
        },
        researchingQuantity: (details.researchingQuantity as number) ?? 0,
        unfulfillableQuantity: (details.unfulfillableQuantity as number) ?? 0,
      },
      lastUpdatedTime: s.lastUpdatedTime as string ?? new Date().toISOString(),
      totalQuantity: (details.fulfillableQuantity as number ?? 0) +
        (details.inboundWorkingQuantity as number ?? 0) +
        (details.inboundShippedQuantity as number ?? 0) +
        (details.inboundReceivingQuantity as number ?? 0),
    } as InventoryItem;
  });
}

// ─────────────────────────────────────────────
// Mock data — shown when no credentials are set
// ─────────────────────────────────────────────

export function getMockInventory(): InventoryItem[] {
  return [
    {
      asin: 'B09B4MLLZ3',
      fnSku: 'X001ABC123',
      sellerSku: 'OB-PRO1000-NEW',
      productName: 'Oral-B Pro 1000 Electric Toothbrush',
      condition: 'NewItem',
      inventoryDetails: {
        fulfillableQuantity: 12,
        inboundWorkingQuantity: 6,
        inboundShippedQuantity: 0,
        inboundReceivingQuantity: 2,
        reservedQuantity: { totalReservedQuantity: 3, pendingCustomerOrderQuantity: 3, pendingTransshipmentQuantity: 0, fcProcessingQuantity: 0 },
        researchingQuantity: 0,
        unfulfillableQuantity: 1,
      },
      lastUpdatedTime: new Date().toISOString(),
      totalQuantity: 20,
    },
    {
      asin: 'B07FZ8S74R',
      fnSku: 'X001DEF456',
      sellerSku: 'IP-DUO6-NEW',
      productName: 'Instant Pot Duo 7-in-1 Electric Pressure Cooker 6qt',
      condition: 'NewItem',
      inventoryDetails: {
        fulfillableQuantity: 5,
        inboundWorkingQuantity: 10,
        inboundShippedQuantity: 4,
        inboundReceivingQuantity: 0,
        reservedQuantity: { totalReservedQuantity: 1, pendingCustomerOrderQuantity: 1, pendingTransshipmentQuantity: 0, fcProcessingQuantity: 0 },
        researchingQuantity: 0,
        unfulfillableQuantity: 0,
      },
      lastUpdatedTime: new Date().toISOString(),
      totalQuantity: 19,
    },
    {
      asin: 'B001TH7GUU',
      fnSku: 'X001GHI789',
      sellerSku: 'STN-32WM-NEW',
      productName: 'Stanley Classic Vacuum Insulated Wide Mouth Bottle 32oz',
      condition: 'NewItem',
      inventoryDetails: {
        fulfillableQuantity: 24,
        inboundWorkingQuantity: 0,
        inboundShippedQuantity: 0,
        inboundReceivingQuantity: 0,
        reservedQuantity: { totalReservedQuantity: 5, pendingCustomerOrderQuantity: 5, pendingTransshipmentQuantity: 0, fcProcessingQuantity: 0 },
        researchingQuantity: 0,
        unfulfillableQuantity: 2,
      },
      lastUpdatedTime: new Date().toISOString(),
      totalQuantity: 24,
    },
    {
      asin: 'B08BHXG144',
      fnSku: 'X001JKL012',
      sellerSku: 'BD-PIVOT-NEW',
      productName: 'BLACK+DECKER Hand Vacuum Cordless Pivot 20V Max',
      condition: 'NewItem',
      inventoryDetails: {
        fulfillableQuantity: 3,
        inboundWorkingQuantity: 8,
        inboundShippedQuantity: 0,
        inboundReceivingQuantity: 0,
        reservedQuantity: { totalReservedQuantity: 0, pendingCustomerOrderQuantity: 0, pendingTransshipmentQuantity: 0, fcProcessingQuantity: 0 },
        researchingQuantity: 1,
        unfulfillableQuantity: 0,
      },
      lastUpdatedTime: new Date().toISOString(),
      totalQuantity: 11,
    },
    {
      asin: 'B07D4H5DJR',
      fnSku: 'X001MNO345',
      sellerSku: 'TILE-4PK-NEW',
      productName: 'Tile Mate (2022) Bluetooth Tracker 4-Pack',
      condition: 'NewItem',
      inventoryDetails: {
        fulfillableQuantity: 0,
        inboundWorkingQuantity: 15,
        inboundShippedQuantity: 5,
        inboundReceivingQuantity: 0,
        reservedQuantity: { totalReservedQuantity: 0, pendingCustomerOrderQuantity: 0, pendingTransshipmentQuantity: 0, fcProcessingQuantity: 0 },
        researchingQuantity: 0,
        unfulfillableQuantity: 0,
      },
      lastUpdatedTime: new Date().toISOString(),
      totalQuantity: 20,
    },
  ];
}
