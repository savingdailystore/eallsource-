/**
 * BullMQ worker process — run separately: npm run worker
 *
 * Handles:
 *  - Weekly scan jobs (existing)
 *  - Scrape → Enrich → Score pipeline (Phase 1)
 */

import { Worker, type Job } from 'bullmq';
import {
  getConnection,
  createWeeklyScanWorker,
  scheduleWeeklyScan,
  enqueueEnrichJob,
  enqueueScoreJob,
} from './queue';

// ── Scrape worker ────────────────────────────────────────────────────────────

function createScrapeWorker() {
  return new Worker(
    'scrape',
    async (job: Job) => {
      const { scrapeAmazonSearch } = await import('@/services/scraper/amazon');
      const { prisma } = await import('@/lib/prisma');

      const { query, scrapeJobId, maxResults = 20 } = job.data as {
        query: string;
        scrapeJobId: string;
        maxResults?: number;
      };

      await prisma.scrapeJob.update({
        where: { id: scrapeJobId },
        data: { status: 'RUNNING', startedAt: new Date() },
      });

      try {
        console.log(`[Scrape] Searching Amazon for: "${query}"`);
        const products = await scrapeAmazonSearch(query, maxResults);
        console.log(`[Scrape] Found ${products.length} products`);

        // Persist raw products
        const created = await Promise.all(
          products.map((p) =>
            prisma.productRaw.create({
              data: {
                asin: p.asin,
                title: p.title,
                url: p.url,
                imageUrl: p.imageUrl,
                price: p.price,
                rating: p.rating,
                reviewCount: p.reviewCount,
                bsr: p.bsr,
                category: p.category,
                isPrime: p.isPrime,
                raw: p.raw as object,
                scrapeJobId,
              },
            }),
          ),
        );

        await prisma.scrapeJob.update({
          where: { id: scrapeJobId },
          data: { itemsFound: created.length },
        });

        // Queue enrichment for each raw product
        await Promise.all(
          created.map((raw) =>
            enqueueEnrichJob({ rawProductId: raw.id, scrapeJobId }),
          ),
        );

        return { scraped: created.length };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await prisma.scrapeJob.update({
          where: { id: scrapeJobId },
          data: { status: 'FAILED', error: msg, completedAt: new Date() },
        });
        throw err;
      }
    },
    { connection: getConnection(), concurrency: 1 },  // 1 browser at a time
  );
}

// ── Enrich worker ────────────────────────────────────────────────────────────

function createEnrichWorker() {
  return new Worker(
    'enrich',
    async (job: Job) => {
      const { enrichProduct } = await import('@/services/enrichment/pipeline');
      const { prisma } = await import('@/lib/prisma');

      const { rawProductId, scrapeJobId } = job.data as {
        rawProductId: string;
        scrapeJobId?: string;
      };

      const result = await enrichProduct(rawProductId, scrapeJobId);

      if (result.leadId) {
        // Increment leads counter on ScrapeJob
        if (scrapeJobId) {
          await prisma.scrapeJob.update({
            where: { id: scrapeJobId },
            data: { leadsCreated: { increment: 1 } },
          }).catch(() => null);
        }
        // Queue scoring
        await enqueueScoreJob({ leadId: result.leadId });
      }

      return result;
    },
    { connection: getConnection(), concurrency: 4 },
  );
}

// ── Score worker ─────────────────────────────────────────────────────────────

function createScoreWorker() {
  return new Worker(
    'score',
    async (job: Job) => {
      const { prisma } = await import('@/lib/prisma');
      const { scoreLead } = await import('@/services/scoring/engine');
      const { assessIpRisk } = await import('@/services/ip-risk/engine');
      const { sendLeadAlert } = await import('@/services/alerts/discord');

      const { leadId } = job.data as { leadId: string };
      const lead = await prisma.lead.findUnique({ where: { id: leadId } });
      if (!lead) return;

      const ipRisk = assessIpRisk(lead.title);
      const { score, breakdown, tier } = scoreLead({
        roi: lead.roi,
        netProfit: lead.netProfit,
        bsr: lead.bsr ?? undefined,
        fbaSellers: lead.fbaSellers,
        amazonOwnsBB: lead.amazonOwnsBB,
        ipRisk: ipRisk.score,
      });

      await prisma.lead.update({
        where: { id: leadId },
        data: { score, scoreBreakdown: breakdown },
      });

      // Discord alert for HOT leads
      if (tier === 'HOT' && !lead.alertSent) {
        await sendLeadAlert(
          {
            asin: lead.asin,
            title: lead.title,
            score,
            roi: lead.roi,
            netProfit: lead.netProfit,
            sourcePrice: lead.sourcePrice,
            amazonPrice: lead.amazonPrice,
            sourceRetailer: lead.sourceRetailer,
            sourceUrl: lead.sourceUrl,
            amazonUrl: lead.amazonUrl,
            imageUrl: lead.imageUrl ?? undefined,
          },
          tier,
        );
        await prisma.lead.update({ where: { id: leadId }, data: { alertSent: true } });
      }

      // Mark scrapeJob completed if all enrichments are done
      if (lead.scrapeJobId) {
        const job_ = await prisma.scrapeJob.findUnique({ where: { id: lead.scrapeJobId } });
        if (job_ && job_.status === 'RUNNING') {
          const pending = await prisma.productRaw.count({
            where: { scrapeJobId: lead.scrapeJobId },
          });
          if (pending > 0) {
            await prisma.scrapeJob.update({
              where: { id: lead.scrapeJobId },
              data: { status: 'COMPLETED', completedAt: new Date() },
            }).catch(() => null);
          }
        }
      }

      return { score, tier };
    },
    { connection: getConnection(), concurrency: 8 },
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[Worker] Starting EALLsource background worker…');

  const weeklyScan  = createWeeklyScanWorker();
  const scrapeWorker = createScrapeWorker();
  const enrichWorker = createEnrichWorker();
  const scoreWorker  = createScoreWorker();

  const workers = [weeklyScan, scrapeWorker, enrichWorker, scoreWorker];

  workers.forEach((w) => {
    w.on('completed', (job, result) => {
      console.log(`[Worker:${w.name}] ✓ Job ${job.id}`, JSON.stringify(result));
    });
    w.on('failed', (job, err) => {
      console.error(`[Worker:${w.name}] ✗ Job ${job?.id} failed:`, err.message);
    });
    w.on('active', (job) => {
      console.log(`[Worker:${w.name}] → Job ${job.id} started (${job.name})`);
    });
  });

  await scheduleWeeklyScan();
  console.log('[Worker] All queues active. Waiting for jobs…');
}

main().catch((err) => {
  console.error('[Worker] Fatal error:', err);
  process.exit(1);
});

export { createWeeklyScanWorker };
