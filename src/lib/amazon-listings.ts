import { getSpApiClient } from './sp-api';

type SpClient = Awaited<ReturnType<typeof getSpApiClient>>;

export interface ListingMarket {
  productType?:  string;
  currentPrice?: number; // the seller's own current listing price
}

/**
 * Read a seller SKU's listing: its productType (required for the price PATCH)
 * and the seller's current price. Returns an empty object if it can't be read.
 */
async function readListing(client: SpClient, sku: string): Promise<ListingMarket> {
  try {
    const data = await client.get(
      `/listings/2021-08-01/items/${client.sellerId}/${encodeURIComponent(sku)}`,
      { marketplaceIds: client.marketplaceId, includedData: 'summaries,offers' },
    );
    const productType = data?.summaries?.[0]?.productType ?? undefined;
    // Listings Items offers: [{ offerType, price: { currencyCode, amount } }]
    const rawPrice    = data?.offers?.[0]?.price?.amount;
    const currentPrice = rawPrice != null && !Number.isNaN(Number(rawPrice)) ? Number(rawPrice) : undefined;
    return { productType, currentPrice };
  } catch {
    return {};
  }
}

/** Public: fetch a SKU's current listing price + productType for repricing. */
export async function getListingMarket(orgId: string, sku: string): Promise<ListingMarket> {
  if (!sku) return {};
  try {
    const client = await getSpApiClient(orgId);
    return await readListing(client, sku);
  } catch {
    return {};
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

  const { productType } = await readListing(client, sku);
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
