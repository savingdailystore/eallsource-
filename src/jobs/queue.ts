import { Queue, Worker, type Job } from 'bullmq';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const parsed = new URL(redisUrl);
const connection = {
  host: parsed.hostname,
  port: Number(parsed.port) || 6379,
  password: parsed.password || undefined,
  tls: redisUrl.startsWith('rediss://') ? {} : undefined,
};

// ─────────────────────────────────────────────
// Queue Definitions
// ─────────────────────────────────────────────

export const weeklyScanQueue = new Queue('weekly-scan', { connection });
export const productScanQueue = new Queue('product-scan', { connection });

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
    { connection, concurrency: 1 },
  );
}
