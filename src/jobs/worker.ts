/**
 * BullMQ worker process — run separately: npm run worker
 *
 * Handles:
 *  - Weekly scan jobs (scheduled or manual)
 *  - Product scan jobs (single ASIN lookups)
 */

import { createWeeklyScanWorker, scheduleWeeklyScan } from './queue';

async function main() {
  console.log('[Worker] Starting EALLsource background worker…');

  const worker = createWeeklyScanWorker();

  worker.on('completed', (job, result) => {
    console.log(`[Worker] Job ${job.id} completed:`, result);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('active', (job) => {
    console.log(`[Worker] Job ${job.id} started: ${job.name}`);
  });

  // Schedule the recurring weekly cron
  await scheduleWeeklyScan();
  console.log('[Worker] Weekly scan scheduled (every Sunday 2:00 AM)');
  console.log('[Worker] Ready — waiting for jobs…');
}

main().catch((err) => {
  console.error('[Worker] Fatal error:', err);
  process.exit(1);
});
