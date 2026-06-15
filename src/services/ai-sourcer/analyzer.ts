import Anthropic from '@anthropic-ai/sdk';
import type { RetailerHit, AmazonSnapshot, ProfitBreakdown, AIDecision } from './types';

const client = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

export async function analyzeOpportunity(
  hit: RetailerHit,
  amazon: AmazonSnapshot | null,
  profit: ProfitBreakdown,
  ipRisk: 'LOW' | 'MEDIUM' | 'HIGH',
): Promise<AIDecision> {
  if (client && amazon) {
    try {
      return await claudeAnalysis(hit, amazon, profit, ipRisk);
    } catch {
      // fall through to rules engine
    }
  }
  return rulesAnalysis(hit, amazon, profit, ipRisk);
}

// ── Claude AI Analysis ────────────────────────────────────────────────────────

async function claudeAnalysis(
  hit: RetailerHit,
  amazon: AmazonSnapshot,
  profit: ProfitBreakdown,
  ipRisk: 'LOW' | 'MEDIUM' | 'HIGH',
): Promise<AIDecision> {
  const prompt = `You are an expert Amazon Online Arbitrage analyst. Analyze this sourcing opportunity and return a JSON decision.

PRODUCT
Name: ${hit.name}
Brand: ${hit.brand}
Category: ${hit.category}

RETAIL SOURCE
Retailer: ${hit.retailer}
Price: $${profit.sourcePrice.toFixed(2)}
After cashback: $${profit.finalCost.toFixed(2)}

AMAZON DATA
ASIN: ${amazon.asin}
Buy Box Price: $${amazon.buyBoxPrice.toFixed(2)}
BSR: #${amazon.bsr.toLocaleString()} in ${amazon.bsrCategory}
FBA Sellers: ${amazon.fbaSellers}
Total Sellers: ${amazon.totalSellers}
Amazon Owns Buy Box: ${amazon.amazonOwnsBuyBox}

FINANCIALS
Net Profit: $${profit.netProfit.toFixed(2)}
ROI: ${profit.roi.toFixed(1)}%
Amazon Fees: $${profit.amazonFees.toFixed(2)}

IP Risk: ${ipRisk}

Respond ONLY with valid JSON matching this exact schema (no markdown, no explanation):
{
  "score": <integer 0-100>,
  "recommendation": <"BUY" | "WATCH" | "SKIP">,
  "confidence": <"HIGH" | "MEDIUM" | "LOW">,
  "reasons": [<string>, <string>],
  "risks": [<string>],
  "note": <string, max 120 chars>
}`;

  const msg = await client!.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
  const parsed = JSON.parse(text);

  return {
    score: Math.max(0, Math.min(100, Number(parsed.score))),
    recommendation: parsed.recommendation,
    confidence: parsed.confidence,
    reasons: Array.isArray(parsed.reasons) ? parsed.reasons.slice(0, 3) : [],
    risks: Array.isArray(parsed.risks) ? parsed.risks.slice(0, 2) : [],
    note: String(parsed.note ?? '').slice(0, 120),
    poweredByAI: true,
  };
}

// ── Rules-based Fallback ──────────────────────────────────────────────────────

function rulesAnalysis(
  hit: RetailerHit,
  amazon: AmazonSnapshot | null,
  profit: ProfitBreakdown,
  ipRisk: 'LOW' | 'MEDIUM' | 'HIGH',
): AIDecision {
  const reasons: string[] = [];
  const risks: string[] = [];
  let score = 50;

  // IP risk gate
  if (ipRisk === 'HIGH') {
    return {
      score: 10, recommendation: 'SKIP', confidence: 'HIGH',
      reasons: [],
      risks: ['High IP risk — brand actively enforces on Amazon'],
      note: 'Skip: brand poses significant IP complaint risk.',
      poweredByAI: false,
    };
  }

  // ROI scoring
  if (profit.roi >= 60) { score += 30; reasons.push(`Strong ROI of ${profit.roi.toFixed(0)}%`); }
  else if (profit.roi >= 40) { score += 18; reasons.push(`Solid ROI of ${profit.roi.toFixed(0)}%`); }
  else if (profit.roi >= 30) { score += 8; reasons.push(`Acceptable ROI of ${profit.roi.toFixed(0)}%`); }
  else { score -= 20; risks.push(`Low ROI at ${profit.roi.toFixed(0)}% — margin may compress`); }

  // Net profit floor
  if (profit.netProfit < 3) { score -= 15; risks.push('Net profit under $3 — too thin for FBA'); }
  else if (profit.netProfit >= 10) { score += 10; reasons.push(`$${profit.netProfit.toFixed(2)} net profit per unit`); }

  // BSR / velocity (Amazon data)
  if (amazon) {
    if (amazon.bsr < 5000) { score += 15; reasons.push(`Excellent BSR #${amazon.bsr.toLocaleString()} — fast mover`); }
    else if (amazon.bsr < 25000) { score += 8; reasons.push(`Good BSR #${amazon.bsr.toLocaleString()}`); }
    else if (amazon.bsr > 200000) { score -= 12; risks.push(`High BSR #${amazon.bsr.toLocaleString()} — slow sales velocity`); }

    if (amazon.amazonOwnsBuyBox) { score -= 20; risks.push('Amazon holds Buy Box — hard to win'); }
    if (amazon.fbaSellers > 12) { score -= 10; risks.push(`${amazon.fbaSellers} FBA competitors — crowded`); }
    else if (amazon.fbaSellers <= 5) { score += 8; reasons.push(`Only ${amazon.fbaSellers} FBA sellers — low competition`); }
  }

  if (ipRisk === 'MEDIUM') { score -= 8; risks.push('Medium IP risk — monitor for complaints'); }

  score = Math.max(0, Math.min(100, score));

  let recommendation: AIDecision['recommendation'];
  let confidence: AIDecision['confidence'];

  if (score >= 70) { recommendation = 'BUY'; confidence = score >= 85 ? 'HIGH' : 'MEDIUM'; }
  else if (score >= 45) { recommendation = 'WATCH'; confidence = 'MEDIUM'; }
  else { recommendation = 'SKIP'; confidence = score <= 25 ? 'HIGH' : 'MEDIUM'; }

  const note =
    recommendation === 'BUY'
      ? `Buy: ${profit.roi.toFixed(0)}% ROI with ${amazon ? `BSR #${amazon.bsr.toLocaleString()}` : 'good margins'}.`
      : recommendation === 'WATCH'
      ? `Watch: decent numbers but ${risks[0]?.toLowerCase() ?? 'some concerns exist'}.`
      : `Skip: ${risks[0]?.toLowerCase() ?? 'does not meet sourcing criteria'}.`;

  return { score, recommendation, confidence, reasons, risks, note, poweredByAI: false };
}
