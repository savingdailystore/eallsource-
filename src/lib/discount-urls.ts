function toSlug(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

// Card Bear uses internal numeric IDs — these are verified from cardbear.com
const CARD_BEAR_IDS: Record<string, number> = {
  'walmart':       4,
  'target':        31,
  'home depot':    2,
  'homedepot':     2,
  'lowes':         19,
  "lowe's":        19,
  'best buy':      12,
  'bestbuy':       12,
  'costco':        527,
  'sams club':     650,
  "sam's club":    650,
  'kmart':         28,
  'wayfair':       584,
  'office depot':  84,
  'officedepot':   84,
  'shell':         390,
  'groupon':       428,
};

function cardBearUrl(retailer: string): string {
  const key = retailer.toLowerCase().trim();
  const id  = CARD_BEAR_IDS[key];
  if (id) return `https://www.cardbear.com/gift-card-discount/${id}/${toSlug(retailer)}`;
  return 'https://www.cardbear.com/gift-cards'; // fallback: full listing page
}

const SOURCE_URL_BUILDERS: Record<string, (retailer: string) => string> = {
  'card bear':        cardBearUrl,
  'cardbear':         cardBearUrl,
  'raise':           (r) => `https://www.raise.com/buy/${toSlug(r)}-gift-cards`,
  'gift card granny':(r) => `https://www.giftcardgranny.com/gift-cards/${toSlug(r)}/`,
  'cardcash':        (r) => `https://www.cardcash.com/buy/${toSlug(r)}-gift-cards/`,
  'card cash':       (r) => `https://www.cardcash.com/buy/${toSlug(r)}-gift-cards/`,
  'giftdeals':       (r) => `https://www.giftdeals.com/${toSlug(r)}-gift-cards/`,
  'rakuten':         (r) => `https://www.rakuten.com/store/${toSlug(r)}/`,
  'ibotta':          ()  => `https://home.ibotta.com/`,
  'honey':           (r) => `https://www.joinhoney.com/shop/${toSlug(r)}`,
  'fetch':           ()  => `https://fetchrewards.com/`,
  'topcashback':     (r) => `https://www.topcashback.com/ref/brands/${toSlug(r)}/`,
  'mrrebates':       (r) => `https://www.mrrebates.com/store/${toSlug(r)}/`,
  'swagbucks':       (r) => `https://www.swagbucks.com/shop/${toSlug(r)}`,
  'dosh':            ()  => `https://www.dosh.cash/`,
};

/**
 * Returns a direct URL to where the user can obtain a discount for a given retailer.
 * Prefers the url already stored on the Discount object, then falls back to
 * known URL patterns per source.
 */
export function discountUrl(source: string, retailer: string, storedUrl?: string): string | null {
  if (storedUrl) return storedUrl;
  const key     = source.toLowerCase().trim();
  const builder = SOURCE_URL_BUILDERS[key];
  return builder ? builder(retailer) : null;
}
