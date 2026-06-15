import { scheduleWeeklyScan } from '@lib/queue';
import { createWeeklyScanWorker } from './weeklyWorker';
import { createScrapeWorker } from './scrapeWorker';
import { createEnrichWorker } from './enrichmentWorker';
import { createScoreWorker } from './scoringWorker';

async function main() {
  console.log('[Worker] Starting EALLsource background workers…');

  const workers = [
    createWeeklyScanWorker(),
    createScrapeWorker(),
    createEnrichWorker(),
    createScoreWorker(),
  ];

  workers.forEach((w) => {
    w.on('completed', (job, result) => {
      console.log(`[${w.name}] ✓ Job ${job.id}`, JSON.stringify(result));
    });
    w.on('failed', (job, err) => {
      console.error(`[${w.name}] ✗ Job ${job?.id} failed:`, err.message);
    });
    w.on('active', (job) => {
      console.log(`[${w.name}] → Job ${job.id} started`);
    });
  });

  await scheduleWeeklyScan();
  console.log('[Worker] All queues active. Waiting for jobs…');
}

main().catch((err) => {
  console.error('[Worker] Fatal:', err);
  process.exit(1);
});
