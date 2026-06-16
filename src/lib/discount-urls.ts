/**
 * Returns a direct URL to where the user can obtain a discount for a given retailer.
 * Prefers the url already stored on the Discount object, then falls back to
 * well-known URL patterns for each source.
 */

function toSlug(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

const SOURCE_URL_BUILDERS: Record<string, (retailer: string) => string> = {
  // Gift-card marketplaces
  'card bear':       (r) => `https://www.cardbear.com/cards/${toSlug(r)}`,
  'cardbear':        (r) => `https://www.cardbear.com/cards/${toSlug(r)}`,
  'raise':           (r) => `https://www.raise.com/buy/${toSlug(r)}-gift-cards`,
  'gift card granny':(r) => `https://www.giftcardgranny.com/gift-cards/${toSlug(r)}/`,
  'cardcash':        (r) => `https://www.cardcash.com/buy/${toSlug(r)}-gift-cards/`,
  'card cash':       (r) => `https://www.cardcash.com/buy/${toSlug(r)}-gift-cards/`,
  'giftdeals':       (r) => `https://www.giftdeals.com/${toSlug(r)}-gift-cards/`,
  // Cashback portals
  'rakuten':         (r) => `https://www.rakuten.com/store/${toSlug(r)}/`,
  'ibotta':          ()  => `https://home.ibotta.com/`,
  'honey':           (r) => `https://www.joinhoney.com/shop/${toSlug(r)}`,
  'fetch':           ()  => `https://fetchrewards.com/`,
  'topcashback':     (r) => `https://www.topcashback.com/ref/brands/${toSlug(r)}/`,
  'cashrewards':     ()  => `https://www.cashrewards.com.au/`,
  'mrrebates':       (r) => `https://www.mrrebates.com/store/${toSlug(r)}/`,
  'swagbucks':       (r) => `https://www.swagbucks.com/shop/${toSlug(r)}`,
  'dosh':            ()  => `https://www.dosh.cash/`,
};

export function discountUrl(source: string, retailer: string, storedUrl?: string): string | null {
  if (storedUrl) return storedUrl;
  const key = source.toLowerCase().trim();
  const builder = SOURCE_URL_BUILDERS[key];
  return builder ? builder(retailer) : null;
}
