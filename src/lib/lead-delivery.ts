import { prisma } from '@/lib/prisma';
import { PLAN_LIMITS } from '@/types';
import type { Plan, LeadTierValue } from '@/types';

// Weekly drop anchor: Monday 13:00 UTC = Monday 06:00 Arizona/Phoenix (UTC-7, no DST year-round)
export function getCurrentDeliveryWeekStart(now = new Date()): Date {
  const dayOfWeek = now.getUTCDay(); // 0=Sun 1=Mon … 6=Sat
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const anchor = new Date(now);
  anchor.setUTCDate(now.getUTCDate() - daysSinceMonday);
  anchor.setUTCHours(13, 0, 0, 0);
  anchor.setUTCMilliseconds(0);

  // Before this Monday's 13:00 UTC drop → fall back to last week's anchor
  if (now < anchor) {
    anchor.setUTCDate(anchor.getUTCDate() - 7);
  }

  return anchor;
}

export async function getWeeklyLeadUsage(orgId: string, weekStart?: Date): Promise<number> {
  const deliveryWeekStart = weekStart ?? getCurrentDeliveryWeekStart();
  return prisma.leadEntitlement.count({
    where: { orgId, deliveryWeekStart, countsTowardWeeklyLimit: true },
  });
}

export async function getRemainingWeeklyLeadSlots(
  org: { id: string; plan: Plan },
  weekStart?: Date,
): Promise<number> {
  const limit = PLAN_LIMITS[org.plan].leadsPerWeek;
  const used  = await getWeeklyLeadUsage(org.id, weekStart);
  return Math.max(0, limit - used);
}

export function allowedLeadTiersForPlan(plan: Plan): LeadTierValue[] {
  return PLAN_LIMITS[plan].allowedLeadTiers;
}
