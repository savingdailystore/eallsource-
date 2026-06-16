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

function redisConfigured(): boolean {
  const url = process.env.REDIS_URL ?? '';
  return url.length > 0 && !url.includes('localhost') && !url.includes('127.0.0.1');
}

// Lazy singletons — queues are only created when a job is actually enqueued
let _scrapeQueue: Queue | null = null;
let _enrichQueue: Queue | null = null;
let _scoreQueue: Queue | null = null;
let _weeklyScanQueue: Queue | null = null;

function scrapeQueue()     { return (_scrapeQueue     ??= new Queue('scrape',       { connection: getConnection() })); }
function enrichQueue()     { return (_enrichQueue     ??= new Queue('enrich',       { connection: getConnection() })); }
function scoreQueue()      { return (_scoreQueue      ??= new Queue('score',        { connection: getConnection() })); }
function weeklyScanQueue() { return (_weeklyScanQueue ??= new Queue('weekly-scan',  { connection: getConnection() })); }

export async function enqueueScrapeJob(payload: {
  url: string;
  scrapeJobId: string;
  maxResults?: number;
}) {
  if (!redisConfigured()) return null;
  return scrapeQueue().add('amazon-search', payload, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5_000 },
  });
}

export async function enqueueEnrichJob(payload: {
  rawProductId: string;
  scrapeJobId?: string;
}) {
  if (!redisConfigured()) return null;
  return enrichQueue().add('enrich-product', payload, {
    attempts: 2,
    backoff: { type: 'fixed', delay: 2_000 },
  });
}

export async function enqueueScoreJob(payload: { leadId: string }) {
  if (!redisConfigured()) return null;
  return scoreQueue().add('score-lead', payload);
}

export async function scheduleWeeklyScan() {
  if (!redisConfigured()) return;
  await weeklyScanQueue().add(
    'weekly-feed',
    {},
    { repeat: { pattern: '0 2 * * 0' }, jobId: 'weekly-feed-recurring' },
  );
}

export async function triggerImmediateScan(batchId?: string) {
  if (!redisConfigured()) return null;
  return weeklyScanQueue().add('weekly-feed', { batchId }, { priority: 1 });
}
