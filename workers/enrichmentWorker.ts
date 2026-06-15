import { Worker, type Job } from 'bullmq';
import { getConnection, enqueueScoreJob } from '@lib/queue';

export function createEnrichWorker() {
  return new Worker(
    'enrich',
    async (job: Job) => {
      const { enrichProduct } = await import('@server/enrichment/pipeline');
      const { prisma } = await import('@lib/prisma');

      const { rawProductId, scrapeJobId } = job.data as {
        rawProductId: string;
        scrapeJobId?: string;
      };

      const result = await enrichProduct(rawProductId, scrapeJobId);

      if (result.leadId) {
        if (scrapeJobId) {
          await prisma.scrapeJob
            .update({ where: { id: scrapeJobId }, data: { leadsCreated: { increment: 1 } } })
            .catch(() => null);
        }
        await enqueueScoreJob({ leadId: result.leadId });
      }

      return result;
    },
    { connection: getConnection(), concurrency: 4 },
  );
}
