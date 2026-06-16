import { Queue } from 'bullmq';

function redisConfigured(): boolean {
  const url = process.env.REDIS_URL ?? '';
  return url.length > 0 && !url.includes('localhost') && !url.includes('127.0.0.1');
}

function getConnection() {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: Number(parsed.port) || 6379,
      password: parsed.password || undefined,
      tls: url.startsWith('rediss://') ? {} : undefined,
    };
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}

// Lazy singletons — never instantiated at module load time
let _scrapeQ:    Queue | null = null;
let _validateQ:  Queue | null = null;
let _matchQ:     Queue | null = null;
let _calcRoiQ:   Queue | null = null;
let _inventoryQ: Queue | null = null;
let _repriceQ:   Queue | null = null;
let _reportQ:    Queue | null = null;

const q = (name: string, ref: Queue | null, set: (q: Queue) => void): Queue => {
  if (!ref) { ref = new Queue(name, { connection: getConnection() }); set(ref); }
  return ref;
};

const scrapeQ    = () => q('scrape_retailer',  _scrapeQ,    (v) => { _scrapeQ    = v; });
const validateQ  = () => q('validate_product', _validateQ,  (v) => { _validateQ  = v; });
const matchQ     = () => q('match_amazon',     _matchQ,     (v) => { _matchQ     = v; });
const calcRoiQ   = () => q('calculate_roi',    _calcRoiQ,   (v) => { _calcRoiQ   = v; });
const inventoryQ = () => q('inventory_sync',   _inventoryQ, (v) => { _inventoryQ = v; });
const repriceQ   = () => q('reprice_listing',  _repriceQ,   (v) => { _repriceQ   = v; });
const reportQ    = () => q('generate_report',  _reportQ,    (v) => { _reportQ    = v; });

export async function enqueueScrape(payload: { retailer: string; orgId: string; scanJobId: string; query: string }) {
  if (!redisConfigured()) return null;
  return scrapeQ().add('scrape', payload, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
}

export async function enqueueValidate(payload: { productId: string; orgId: string }) {
  if (!redisConfigured()) return null;
  return validateQ().add('validate', payload, { attempts: 2, backoff: { type: 'fixed', delay: 3000 } });
}

export async function enqueueMatch(payload: { rawProductId: string; orgId: string }) {
  if (!redisConfigured()) return null;
  return matchQ().add('match', payload, { attempts: 2 });
}

export async function enqueueCalcRoi(payload: { productId: string; orgId: string }) {
  if (!redisConfigured()) return null;
  return calcRoiQ().add('calc-roi', payload);
}

export async function enqueueInventorySync(payload: { orgId: string }) {
  if (!redisConfigured()) return null;
  return inventoryQ().add('sync', payload, { attempts: 2 });
}

export async function enqueueReprice(payload: { orgId: string; asin: string }) {
  if (!redisConfigured()) return null;
  return repriceQ().add('reprice', payload);
}

export async function enqueueReport(payload: { orgId: string; type: string }) {
  if (!redisConfigured()) return null;
  return reportQ().add('report', payload);
}
