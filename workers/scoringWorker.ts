import { Worker, type Job } from 'bullmq';
import { getConnection } from '@lib/queue';

export function createScoreWorker() {
  return new Worker(
    'score',
    async (job: Job) => {
      const { prisma }       = await import('@lib/prisma');
      const { scoreLead }    = await import('@server/scoring/engine');
      const { assessIpRisk } = await import('@server/services/ip-risk/engine');
      const { sendLeadAlert } = await import('@server/services/alerts/discord');

      const { leadId } = job.data as { leadId: string };
      const lead = await prisma.lead.findUnique({
        where:   { id: leadId },
        include: { product: true },
      });
      if (!lead) return;

      const ipRisk = assessIpRisk(lead.product.title);
      const { score, breakdown, tier } = scoreLead({
        roi:          lead.product.roi,
        netProfit:    lead.product.profit,
        fbaSellers:   6,      // default — not stored in new schema
        amazonOwnsBB: false,  // default — not stored in new schema
        ipRisk:       ipRisk.score,
      });

      await prisma.lead.update({ where: { id: leadId }, data: { score } });

      if (tier === 'HOT') {
        await sendLeadAlert(
          {
            asin:           lead.product.asin,
            title:          lead.product.title,
            score,
            roi:            lead.product.roi,
            netProfit:      lead.product.profit,
            sourcePrice:    lead.product.price - lead.product.fees - lead.product.profit,
            amazonPrice:    lead.product.price,
            sourceRetailer: 'Walmart',
            sourceUrl:      `https://www.amazon.com/dp/${lead.product.asin}`,
            amazonUrl:      `https://www.amazon.com/dp/${lead.product.asin}`,
          },
          tier,
        );
      }

      void breakdown; // used for typing only in this simplified version
      return { score, tier };
    },
    { connection: getConnection(), concurrency: 8 },
  );
}
