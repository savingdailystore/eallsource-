import { Worker, type Job } from 'bullmq';
import { getConnection } from '@lib/queue';

export function createWeeklyScanWorker() {
  return new Worker(
    'weekly-scan',
    async (_job: Job) => {
      const { runWeeklyFeed } = await import('@server/services/scanner/weekly-feed');

      console.log('[WeeklyWorker] Starting weekly scan...');
      const result = await runWeeklyFeed();

      console.log(
        `[WeeklyWorker] Done — processed: ${result.processed}, passed: ${result.passed}, failed: ${result.failed}`,
      );
      return result;
    },
    { connection: getConnection(), concurrency: 1 },
  );
}
