import { Worker, type Job } from 'bullmq';
import { getConnection } from '@lib/queue';

export function createWeeklyScanWorker() {
  return new Worker(
    'weekly-scan',
    async (job: Job) => {
      const { prisma } = await import('@lib/prisma');
      const { runWeeklyFeed } = await import('@server/services/scanner/weekly-feed');
      const { getWeekNumber } = await import('@lib/utils');

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
          data: { status: 'COMPLETED', totalFound: result.processed, totalPassed: result.passed, completedAt: new Date() },
        });
        return result;
      } catch (err) {
        await prisma.weeklyBatch.update({ where: { id: batch.id }, data: { status: 'FAILED' } });
        throw err;
      }
    },
    { connection: getConnection(), concurrency: 1 },
  );
}
