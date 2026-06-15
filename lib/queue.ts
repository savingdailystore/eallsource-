import { Queue } from 'bullmq';

export function getConnection() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  try {
    const parsed = new URL(redisUrl);
    return {
      host: parsed.hostname,
      port: Number(parsed.port) || 6379,
      password: parsed.password || undefined,
      tls: redisUrl.startsWith('rediss://') ? {} : undefined,
    };
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}

// ─────────────────────────────────────────────
// Queue Definitions
// ─────────────────────────────────────────────

export const weeklyScanQueue  = new Queue('weekly-scan',  { connection: getConnection() });
export const productScanQueue = new Queue('product-scan', { connection: getConnection() });
export const scrapeQueue      = new Queue('scrape',       { connection: getConnection() });
export const enrichQueue      = new Queue('enrich',       { connection: getConnection() });
export const scoreQueue       = new Queue('score',        { connection: getConnection() });

// ─────────────────────────────────────────────
// Job Helpers
// ─────────────────────────────────────────────

export async function enqueueScrapeJob(payload: {
  url: string;
  scrapeJobId: string;
  maxResults?: number;
}) {
  return scrapeQueue.add('amazon-search', payload, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5_000 },
  });
}

export async function enqueueEnrichJob(payload: {
  rawProductId: string;
  scrapeJobId?: string;
}) {
  return enrichQueue.add('enrich-product', payload, {
    attempts: 2,
    backoff: { type: 'fixed', delay: 2_000 },
  });
}

export async function enqueueScoreJob(payload: { leadId: string }) {
  return scoreQueue.add('score-lead', payload);
}

export async function scheduleWeeklyScan() {
  await weeklyScanQueue.add(
    'weekly-feed',
    {},
    { repeat: { pattern: '0 2 * * 0' }, jobId: 'weekly-feed-recurring' },
  );
}

export async function triggerImmediateScan(batchId?: string) {
  return weeklyScanQueue.add('weekly-feed', { batchId }, { priority: 1 });
}
