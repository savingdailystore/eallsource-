import { Worker, type Job } from 'bullmq';
import { getConnection, enqueueEnrichJob } from '@lib/queue';

export function createScrapeWorker() {
  return new Worker(
    'scrape',
    async (job: Job) => {
      const { scrapeAmazonSearch } = await import('@scraper/amazon');
      const { prisma } = await import('@lib/prisma');

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

        await Promise.all(
          created.map((raw) => enqueueEnrichJob({ rawProductId: raw.id, scrapeJobId })),
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
    { connection: getConnection(), concurrency: 1 },
  );
}
