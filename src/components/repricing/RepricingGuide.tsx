'use client';

import { PageGuide } from '@/components/ui/PageGuide';

const STEPS = [
  {
    title: '1. Set what you paid',
    body:  'Click the sliders icon on any rule and enter your Unit Cost. Without a cost (or a Manual Floor), the rule is skipped — we won\'t price something we can\'t prove is profitable.',
  },
  {
    title: '2. Run All Now',
    body:  'Pulls live Amazon prices and calculates a recommended price for each rule. Nothing changes yet — all proposals queue for your review.',
  },
  {
    title: '3. Review & Push',
    body:  'Check each proposal in the Price Proposals section. Click Push on a row (or "Push all") to go live. Only then is the new price sent to Amazon.',
  },
];

export function RepricingGuide() {
  return (
    <PageGuide
      storageKey="repricing-guide-collapsed"
      title="How repricing works"
      subtitle="Nothing goes live until you click Push. A price never drops below your floor. Badges next to each rule show what needs attention."
      steps={STEPS}
      columns={3}
      defaultOpen={false}
    />
  );
}
