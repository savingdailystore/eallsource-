import { getSpApiClient } from './sp-api';

type SpClient = Awaited<ReturnType<typeof getSpApiClient>>;

/**
 * Fetch the productType for a given seller SKU. The Listings Items PATCH
 * requires the listing's real productType (e.g. "CHEMICAL", "SHOES"); a generic
 * value is often rejected. Returns null if the SKU/listing can't be read.
 */
async function getListingProductType(client: SpClient, sku: string): Promise<string | null> {
  try {
    const data = await client.get(
      `/listings/2021-08-01/items/${client.sellerId}/${encodeURIComponent(sku)}`,
      { marketplaceIds: client.marketplaceId, includedData: 'summaries' },
    );
    const summaries = data?.summaries ?? [];
    return summaries[0]?.productType ?? null;
  } catch {
    return null;
  }
}

export interface PushPriceResult {
  ok:           boolean;
  submissionId?: string;
  error?:       string;
}

/**
 * Push a new price to a live Amazon listing via the Listings Items API.
 *
 * This MUTATES the seller's real listing. Callers must enforce floor/sanity
 * checks before invoking. Amazon accepts the patch asynchronously — an "ACCEPTED"
 * status means the change was queued, not that it's live yet.
 */
export async function pushListingPrice(orgId: string, sku: string, price: number): Promise<PushPriceResult> {
  if (!sku)            return { ok: false, error: 'No seller SKU for this listing.' };
  if (!(price > 0))    return { ok: false, error: `Refusing to push a non-positive price ($${price}).` };

  let client: SpClient;
  try {
    client = await getSpApiClient(orgId);
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Amazon not connected.' };
  }

  if (!client.sellerId) return { ok: false, error: 'Missing Amazon seller ID — reconnect your account.' };

  const productType = await getListingProductType(client, sku);
  if (!productType) {
    return { ok: false, error: `Could not read listing for SKU "${sku}" — it may not exist on your account.` };
  }

  const rounded = Math.round(price * 100) / 100;

  const body = {
    productType,
    patches: [
      {
        op:    'replace',
        path:  '/attributes/purchasable_offer',
        value: [
          {
            marketplace_id: client.marketplaceId,
            currency:       'USD',
            our_price: [
              { schedule: [{ value_with_tax: rounded }] },
            ],
          },
        ],
      },
    ],
  };

  try {
    const res = await client.patch(
      `/listings/2021-08-01/items/${client.sellerId}/${encodeURIComponent(sku)}`,
      { marketplaceIds: client.marketplaceId },
      body,
    );

    // status is ACCEPTED | INVALID. INVALID comes back with an issues array.
    if (res?.status && res.status !== 'ACCEPTED') {
      const issue = res?.issues?.[0]?.message ?? `Amazon rejected the update (${res.status}).`;
      return { ok: false, error: issue };
    }
    return { ok: true, submissionId: res?.submissionId };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'SP-API request failed.' };
  }
}
