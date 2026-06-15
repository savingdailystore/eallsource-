import type { RetailerHit } from './types';

const WALMART_API_KEY = process.env.WALMART_API_KEY;
const WALMART_API_BASE = 'https://api.walmartlabs.com/v1';

interface WalmartItem {
  itemId: number;
  name: string;
  salePrice: number;
  brandName?: string;
  thumbnailImage?: string;
  mediumImage?: string;
  upc?: string;
  categoryPath?: string;
  productUrl?: string;
}

interface WalmartSearchResponse {
  items?: WalmartItem[];
}

export async function searchWalmart(query: string, limit = 15): Promise<RetailerHit[]> {
  if (WALMART_API_KEY) {
    return searchWalmartAPI(query, limit);
  }
  return demoWalmartResults(query, limit);
}

async function searchWalmartAPI(query: string, limit: number): Promise<RetailerHit[]> {
  try {
    const url =
      `${WALMART_API_BASE}/search?query=${encodeURIComponent(query)}` +
      `&apiKey=${WALMART_API_KEY}&numItems=${limit}&format=json&responseGroup=full`;

    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return demoWalmartResults(query, limit);

    const data: WalmartSearchResponse = await res.json();
    if (!data.items?.length) return [];

    return data.items.map((item) => ({
      name: item.name,
      brand: item.brandName ?? 'Unknown',
      retailer: 'Walmart',
      sourcePrice: item.salePrice,
      sourceUrl:
        item.productUrl ??
        `https://www.walmart.com/ip/${item.itemId}`,
      imageUrl:
        item.mediumImage ?? item.thumbnailImage ?? '',
      upc: item.upc,
      category: mapWalmartCategory(item.categoryPath ?? ''),
    }));
  } catch {
    return demoWalmartResults(query, limit);
  }
}

function mapWalmartCategory(path: string): string {
  const p = path.toLowerCase();
  if (p.includes('toy') || p.includes('game')) return 'Toys & Games';
  if (p.includes('electronic')) return 'Electronics';
  if (p.includes('kitchen') || p.includes('home')) return 'Home & Kitchen';
  if (p.includes('health') || p.includes('beauty') || p.includes('personal')) return 'Health & Beauty';
  if (p.includes('sport') || p.includes('outdoor')) return 'Sports & Outdoors';
  if (p.includes('office') || p.includes('school')) return 'Office Products';
  if (p.includes('pet')) return 'Pet Supplies';
  if (p.includes('grocery') || p.includes('food')) return 'Grocery';
  return 'Home & Kitchen';
}

// ── Demo catalogue (used when WALMART_API_KEY is not configured) ──────────────
// Products have REAL ASINs and Walmart search URLs.
// Direct product-page URLs become available once WALMART_API_KEY is added.

const DEMO_CATALOGUE: (RetailerHit & { keywords: string[] })[] = [
  {
    name: 'Oral-B Pro 1000 Power Rechargeable Electric Toothbrush',
    brand: 'Oral-B',
    retailer: 'Walmart',
    sourcePrice: 39.97,
    sourceUrl: 'https://www.walmart.com/search?q=Oral-B+Pro+1000+Electric+Toothbrush',
    imageUrl: 'https://i5.walmartimages.com/seo/Oral-B-Pro-1000-Electric-Toothbrush_thumbnail.jpg',
    upc: '069055856890',
    asin: 'B09B4MLLZ3',
    category: 'Health & Beauty',
    keywords: ['oral-b', 'toothbrush', 'electric', 'dental', 'health'],
  },
  {
    name: 'CeraVe Moisturizing Cream for Normal to Dry Skin 19 oz',
    brand: 'CeraVe',
    retailer: 'Walmart',
    sourcePrice: 14.97,
    sourceUrl: 'https://www.walmart.com/search?q=CeraVe+Moisturizing+Cream+19+oz',
    imageUrl: 'https://i5.walmartimages.com/seo/CeraVe-Moisturizing-Cream_thumbnail.jpg',
    upc: '301871574217',
    asin: 'B00TTD9BRC',
    category: 'Health & Beauty',
    keywords: ['cerave', 'moisturizer', 'cream', 'skin', 'lotion', 'beauty', 'health'],
  },
  {
    name: 'Colgate Total Whitening Toothpaste 5.1 oz 3-Pack',
    brand: 'Colgate',
    retailer: 'Walmart',
    sourcePrice: 9.97,
    sourceUrl: 'https://www.walmart.com/search?q=Colgate+Total+Whitening+Toothpaste+3+pack',
    imageUrl: 'https://i5.walmartimages.com/seo/Colgate-Total-Toothpaste_thumbnail.jpg',
    upc: '035000975638',
    asin: 'B07WHDM96N',
    category: 'Health & Beauty',
    keywords: ['colgate', 'toothpaste', 'whitening', 'dental', 'health'],
  },
  {
    name: 'Instant Pot Duo 7-in-1 Electric Pressure Cooker 6 Quart',
    brand: 'Instant Pot',
    retailer: 'Walmart',
    sourcePrice: 79.00,
    sourceUrl: 'https://www.walmart.com/search?q=Instant+Pot+Duo+6+quart',
    imageUrl: 'https://i5.walmartimages.com/seo/Instant-Pot-Duo_thumbnail.jpg',
    upc: '810028581738',
    asin: 'B07FZ8S74R',
    category: 'Home & Kitchen',
    keywords: ['instant pot', 'pressure cooker', 'kitchen', 'cooking', 'appliance'],
  },
  {
    name: 'Monopoly Classic Board Game',
    brand: 'Hasbro',
    retailer: 'Walmart',
    sourcePrice: 14.97,
    sourceUrl: 'https://www.walmart.com/search?q=Monopoly+Classic+Board+Game',
    imageUrl: 'https://i5.walmartimages.com/seo/Monopoly-Board-Game_thumbnail.jpg',
    upc: '630509575138',
    asin: 'B00A2KD8NY',
    category: 'Toys & Games',
    keywords: ['monopoly', 'board game', 'toy', 'game', 'family', 'hasbro'],
  },
  {
    name: 'Crayola Crayons 64 Count Box with Sharpener',
    brand: 'Crayola',
    retailer: 'Walmart',
    sourcePrice: 6.97,
    sourceUrl: 'https://www.walmart.com/search?q=Crayola+64+count+crayons',
    imageUrl: 'https://i5.walmartimages.com/seo/Crayola-Crayons-64-Count_thumbnail.jpg',
    upc: '071662520649',
    asin: 'B00000J1ER',
    category: 'Toys & Games',
    keywords: ['crayola', 'crayons', 'art', 'craft', 'school', 'toy', 'kids'],
  },
  {
    name: 'Sharpie Permanent Markers Fine Point Assorted Colors 24-Count',
    brand: 'Sharpie',
    retailer: 'Walmart',
    sourcePrice: 12.97,
    sourceUrl: 'https://www.walmart.com/search?q=Sharpie+permanent+markers+24+pack',
    imageUrl: 'https://i5.walmartimages.com/seo/Sharpie-Markers-24-Pack_thumbnail.jpg',
    upc: '071641730244',
    asin: 'B07HBQPZP9',
    category: 'Office Products',
    keywords: ['sharpie', 'markers', 'pens', 'office', 'school', 'art'],
  },
  {
    name: 'AmazonBasics AA Performance Alkaline Batteries 48-Pack',
    brand: 'Amazon Basics',
    retailer: 'Walmart',
    sourcePrice: 16.97,
    sourceUrl: 'https://www.walmart.com/search?q=AA+alkaline+batteries+48+pack',
    imageUrl: 'https://i5.walmartimages.com/seo/AA-Batteries-48-Pack_thumbnail.jpg',
    upc: '841710100204',
    asin: 'B00MNV8E0C',
    category: 'Electronics',
    keywords: ['batteries', 'aa', 'alkaline', 'electronics', 'power'],
  },
  {
    name: 'Waterpik Aquarius Water Flosser WP-660',
    brand: 'Waterpik',
    retailer: 'Walmart',
    sourcePrice: 44.97,
    sourceUrl: 'https://www.walmart.com/search?q=Waterpik+Aquarius+water+flosser+WP-660',
    imageUrl: 'https://i5.walmartimages.com/seo/Waterpik-WP-660_thumbnail.jpg',
    upc: '731001002200',
    asin: 'B00HFQQ0VU',
    category: 'Health & Beauty',
    keywords: ['waterpik', 'flosser', 'dental', 'oral care', 'health'],
  },
  {
    name: 'Cuisinart DCC-3200P1 PerfecTemp 14-Cup Programmable Coffee Maker',
    brand: 'Cuisinart',
    retailer: 'Walmart',
    sourcePrice: 49.00,
    sourceUrl: 'https://www.walmart.com/search?q=Cuisinart+DCC-3200+coffee+maker',
    imageUrl: 'https://i5.walmartimages.com/seo/Cuisinart-Coffee-Maker_thumbnail.jpg',
    upc: '086279186348',
    asin: 'B07NF76M5L',
    category: 'Home & Kitchen',
    keywords: ['cuisinart', 'coffee', 'maker', 'kitchen', 'appliance'],
  },
  {
    name: 'Rubbermaid Brilliance 22-Piece Food Storage Container Set',
    brand: 'Rubbermaid',
    retailer: 'Walmart',
    sourcePrice: 29.97,
    sourceUrl: 'https://www.walmart.com/search?q=Rubbermaid+Brilliance+food+storage+22+piece',
    imageUrl: 'https://i5.walmartimages.com/seo/Rubbermaid-Brilliance_thumbnail.jpg',
    upc: '071691340126',
    asin: 'B07PHLKGGL',
    category: 'Home & Kitchen',
    keywords: ['rubbermaid', 'storage', 'containers', 'kitchen', 'home', 'food'],
  },
  {
    name: 'Dove Men+Care Body Wash Extra Fresh 30 fl oz 3-Pack',
    brand: 'Dove',
    retailer: 'Walmart',
    sourcePrice: 13.97,
    sourceUrl: 'https://www.walmart.com/search?q=Dove+Men+Care+body+wash+30+oz+3+pack',
    imageUrl: 'https://i5.walmartimages.com/seo/Dove-Men-Care-Body-Wash_thumbnail.jpg',
    upc: '011111025933',
    asin: 'B07BFH7HCR',
    category: 'Health & Beauty',
    keywords: ['dove', 'body wash', 'shower', 'men', 'health', 'beauty', 'grooming'],
  },
  {
    name: 'Lysol Disinfecting Wipes 80-Count 3-Pack Lemon Breeze',
    brand: 'Lysol',
    retailer: 'Walmart',
    sourcePrice: 11.97,
    sourceUrl: 'https://www.walmart.com/search?q=Lysol+disinfecting+wipes+80+count+3+pack',
    imageUrl: 'https://i5.walmartimages.com/seo/Lysol-Disinfecting-Wipes_thumbnail.jpg',
    upc: '019200929136',
    asin: 'B000BB7MPG',
    category: 'Home & Kitchen',
    keywords: ['lysol', 'wipes', 'cleaning', 'disinfect', 'home', 'household'],
  },
  {
    name: 'Energizer MAX AA Batteries 40-Pack',
    brand: 'Energizer',
    retailer: 'Walmart',
    sourcePrice: 19.97,
    sourceUrl: 'https://www.walmart.com/search?q=Energizer+MAX+AA+batteries+40+pack',
    imageUrl: 'https://i5.walmartimages.com/seo/Energizer-AA-Batteries-40-Pack_thumbnail.jpg',
    upc: '039800015853',
    asin: 'B07M93Z1RG',
    category: 'Electronics',
    keywords: ['energizer', 'batteries', 'aa', 'alkaline', 'electronics'],
  },
  {
    name: 'Play-Doh Modeling Compound 10-Pack',
    brand: 'Play-Doh',
    retailer: 'Walmart',
    sourcePrice: 8.97,
    sourceUrl: 'https://www.walmart.com/search?q=Play-Doh+10+pack+modeling+compound',
    imageUrl: 'https://i5.walmartimages.com/seo/Play-Doh-10-Pack_thumbnail.jpg',
    upc: '630509916047',
    asin: 'B00JM5GW10',
    category: 'Toys & Games',
    keywords: ['play-doh', 'playdoh', 'clay', 'craft', 'toy', 'kids', 'art'],
  },
];

function demoWalmartResults(query: string, limit: number): RetailerHit[] {
  const q = query.toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);

  const scored = DEMO_CATALOGUE.map((item) => {
    const nameText = item.name.toLowerCase();
    const brandText = item.brand.toLowerCase();
    let score = 0;

    for (const word of words) {
      if (nameText.includes(word)) score += 3;
      if (brandText.includes(word)) score += 2;
      if (item.keywords.some((k) => k.includes(word) || word.includes(k))) score += 1;
    }

    if (score === 0) {
      // Category fallback
      const categoryMap: Record<string, string[]> = {
        'health': ['Health & Beauty'],
        'beauty': ['Health & Beauty'],
        'kitchen': ['Home & Kitchen'],
        'home': ['Home & Kitchen'],
        'toy': ['Toys & Games'],
        'game': ['Toys & Games'],
        'office': ['Office Products'],
        'electronic': ['Electronics'],
      };
      for (const [kw, cats] of Object.entries(categoryMap)) {
        if (q.includes(kw) && cats.includes(item.category)) score += 0.5;
      }
    }

    return { item, score };
  });

  const filtered = scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { keywords, ...hit } = x.item;
      return hit;
    });

  // If no matches at all, return top mixed results
  if (!filtered.length) {
    return DEMO_CATALOGUE.slice(0, limit).map(({ keywords: _k, ...hit }) => hit);
  }

  return filtered;
}
