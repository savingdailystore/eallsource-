export interface DiscordLeadAlert {
  asin: string;
  title: string;
  score: number;
  roi: number;
  netProfit: number;
  sourcePrice: number;
  amazonPrice: number;
  sourceRetailer: string;
  sourceUrl: string;
  amazonUrl: string;
  imageUrl?: string;
}

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

const TIER_COLOR: Record<string, number> = {
  HOT:      0x16a34a,   // green
  GOOD:     0x2563eb,   // blue
  MARGINAL: 0xd97706,   // amber
};

export async function sendLeadAlert(lead: DiscordLeadAlert, tier: string): Promise<void> {
  if (!WEBHOOK_URL) return;

  const color = TIER_COLOR[tier] ?? 0x6b7280;

  const payload = {
    username: 'EALLsource Lead Bot',
    avatar_url: 'https://cdn.discordapp.com/embed/avatars/0.png',
    embeds: [
      {
        title: `🔥 ${tier} Lead — Score ${lead.score}/100`,
        description: `**${lead.title}**`,
        color,
        fields: [
          { name: '📦 ASIN',         value: lead.asin,                               inline: true },
          { name: '🏪 Source',        value: lead.sourceRetailer,                     inline: true },
          { name: '💰 ROI',           value: `${lead.roi.toFixed(1)}%`,               inline: true },
          { name: '🛒 Buy At',        value: `$${lead.sourcePrice.toFixed(2)}`,        inline: true },
          { name: '📈 Sell At',       value: `$${lead.amazonPrice.toFixed(2)}`,        inline: true },
          { name: '🤑 Net Profit',    value: `$${lead.netProfit.toFixed(2)}`,          inline: true },
          { name: '🔗 Retailer',      value: `[View on ${lead.sourceRetailer}](${lead.sourceUrl})`, inline: false },
          { name: '🟠 Amazon',        value: `[View on Amazon](${lead.amazonUrl})`,    inline: false },
        ],
        thumbnail: lead.imageUrl ? { url: lead.imageUrl } : undefined,
        footer: { text: 'EALLsource Intelligence' },
        timestamp: new Date().toISOString(),
      },
    ],
  };

  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // Non-fatal — don't throw, just log
    console.error('[Alert] Discord webhook failed');
  }
}
