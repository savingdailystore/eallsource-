import { Worker, type Job } from 'bullmq';
import { getConnection, enqueueEnrichJob } from '@lib/queue';

export function createScrapeWorker() {
  return new Worker(
    'scrape',
    async (job: Job) => {
      const { scrapeAmazonSearch } = await import('@scraper/amazon');
      const { prisma } = await import('@lib/prisma');

      const { url, scrapeJobId, maxResults = 20 } = job.data as {
        url: string;
        scrapeJobId: string;
        maxResults?: number;
      };

      await prisma.scrapeJob.update({
        where: { id: scrapeJobId },
        data:  { status: 'RUNNING' },
      });

      try {
        console.log(`[Scrape] Searching Amazon for: "${url}"`);
        const products = await scrapeAmazonSearch(url, maxResults);
        console.log(`[Scrape] Found ${products.length} products`);

        const created = await Promise.all(
          products.map((p) =>
            prisma.productRaw.create({
              data: {
                asin:    p.asin,
                title:   p.title,
                url:     p.url,
                price:   p.price,
                rawData: p.raw as object,
              },
            }),
          ),
        );

        await Promise.all(
          created.map((raw) => enqueueEnrichJob({ rawProductId: raw.id, scrapeJobId })),
        );

        await prisma.scrapeJob.update({
          where: { id: scrapeJobId },
          data:  { status: 'COMPLETED' },
        });

        return { scraped: created.length };
      } catch (err) {
        await prisma.scrapeJob.update({
          where: { id: scrapeJobId },
          data:  { status: 'FAILED' },
        });
        throw err;
      }
    },
    { connection: getConnection(), concurrency: 1 },
  );
}
