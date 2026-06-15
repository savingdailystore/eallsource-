import { Worker, type Job } from 'bullmq';
import { getConnection } from '@lib/queue';

export function createScoreWorker() {
  return new Worker(
    'score',
    async (job: Job) => {
      const { prisma } = await import('@lib/prisma');
      const { scoreLead } = await import('@server/scoring/engine');
      const { assessIpRisk } = await import('@server/services/ip-risk/engine');
      const { sendLeadAlert } = await import('@server/services/alerts/discord');

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

      await prisma.lead.update({ where: { id: leadId }, data: { score, scoreBreakdown: breakdown } });

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

      if (lead.scrapeJobId) {
        const j = await prisma.scrapeJob.findUnique({ where: { id: lead.scrapeJobId } });
        if (j?.status === 'RUNNING') {
          await prisma.scrapeJob
            .update({ where: { id: lead.scrapeJobId }, data: { status: 'COMPLETED', completedAt: new Date() } })
            .catch(() => null);
        }
      }

      return { score, tier };
    },
    { connection: getConnection(), concurrency: 8 },
  );
}
