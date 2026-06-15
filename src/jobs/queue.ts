import { Queue, Worker, type Job } from 'bullmq';

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

// Phase 1 — Intelligence pipeline
export const scrapeQueue  = new Queue('scrape',  { connection: getConnection() });
export const enrichQueue  = new Queue('enrich',  { connection: getConnection() });
export const scoreQueue   = new Queue('score',   { connection: getConnection() });

// ─────────────────────────────────────────────
// Phase 1 job helpers
// ─────────────────────────────────────────────

export async function enqueueScrapeJob(payload: {
  query: string;
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

// ─────────────────────────────────────────────
// Job Schedulers
// ─────────────────────────────────────────────

export async function scheduleWeeklyScan() {
  // Run every Sunday at 2 AM
  await weeklyScanQueue.add(
    'weekly-feed',
    {},
    {
      repeat: { pattern: '0 2 * * 0' },
      jobId: 'weekly-feed-recurring',
    },
  );
}

export async function triggerImmediateScan(batchId?: string) {
  return weeklyScanQueue.add('weekly-feed', { batchId }, { priority: 1 });
}

// ─────────────────────────────────────────────
// Worker (run separately via `npm run worker`)
// ─────────────────────────────────────────────

export function createWeeklyScanWorker() {
  return new Worker(
    'weekly-scan',
    async (job: Job) => {
      const { prisma } = await import('@/lib/prisma');
      const { runWeeklyFeed } = await import('@/services/scanner/weekly-feed');
      const { getWeekNumber } = await import('@/lib/utils');

      const { week, year } = getWeekNumber();

      const batch = await prisma.weeklyBatch.upsert({
        where: { weekNumber_year: { weekNumber: week, year } },
        create: { weekNumber: week, year, status: 'RUNNING' },
        update: { status: 'RUNNING' },
      });

      try {
        const result = await runWeeklyFeed(batch.id);

        await prisma.weeklyBatch.update({
          where: { id: batch.id },
          data: {
            status: 'COMPLETED',
            totalFound: result.processed,
            totalPassed: result.passed,
            completedAt: new Date(),
          },
        });

        return result;
      } catch (err) {
        await prisma.weeklyBatch.update({
          where: { id: batch.id },
          data: { status: 'FAILED' },
        });
        throw err;
      }
    },
    { connection: getConnection(), concurrency: 1 },
  );
}
