import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { leadAccessWhere } from '@/lib/lead-access';
import { notFound } from 'next/navigation';
import { formatCurrency, formatPercent, buildAmazonUrl, buildKeepaUrl } from '@/lib/utils';
import { scoreLabel } from '@/engines/scoring';
import {
  ArrowLeft, ExternalLink, TrendingUp, ShieldCheck, ShieldAlert, ShieldX,
  CheckCircle2, XCircle, Package, BarChart3,
} from 'lucide-react';

import Link from 'next/link';
import type { Discount } from '@/types';
import { ProfitabilityCalculator } from '@/components/leads/ProfitabilityCalculator';
import { FeeFreshnessBadge } from '@/components/leads/FeeFreshnessBadge';
import { LeadNotes } from '@/components/leads/LeadNotes';
import { IpHistoryFlag } from '@/components/leads/IpHistoryFlag';
import { ProductHero } from '@/components/leads/ProductHero';
import { ungatingOutlook } from '@/engines/gating';
import { buildConfidence } from '@/engines/confidence';
import { buildTimeline } from '@/engines/timeline';
import { buildRiskBreakdown } from '@/engines/riskPresentation';
import { buildHistoricalInsights } from '@/engines/historicalInsights';
import { amazonPresence } from '@/engines/keepaHistoryMetrics';
import type { KeepaHistorySnapshot } from '@/lib/keepa';
import { ConfidencePanel } from '@/components/leads/ConfidencePanel';
import { ExplanationPanel } from '@/components/leads/ExplanationPanel';
import { OpportunityTimeline } from '@/components/leads/OpportunityTimeline';
import { RiskBreakdownPanel } from '@/components/leads/RiskBreakdownPanel';
import { HistoricalInsights } from '@/components/leads/HistoricalInsights';
import { CreateOrderModal } from '@/components/orders/CreateOrderModal';
import { FeeRefreshButton } from '@/components/leads/FeeRefreshButton';
import { canShowFeeRefreshButton } from '@/lib/canShowFeeRefreshButton';

export const dynamic = 'force-dynamic';

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id }  = await params;
  const { orgId } = session!.user;

  const org = await prisma.organization.findUnique({
    where:  { id: orgId },
    select: { isBroadcastSource: true },
  });
  const isBroadcastSource = org?.isBroadcastSource ?? false;

  const lead = await prisma.lead.findFirst({
    where:   { id, ...leadAccessWhere({ orgId, isBroadcastSource }) },
    include: { product: true },
  });

  if (!lead) notFound();

  const [linkedPOItem, linkedInventory] = await Promise.all([
    lead.status === 'PURCHASED'
      ? prisma.purchaseOrderItem.findFirst({
          where:  { leadId: lead.id },
          select: { purchaseOrderId: true },
        })
      : Promise.resolve(null),
    prisma.inventoryItem.findFirst({
      where:  { orgId: session!.user.orgId, asin: lead.product.asin },
      select: { id: true },
    }),
  ]);

  const p = lead.product;
  const { label, color } = scoreLabel(lead.score);
  const discounts = (p.availableDiscounts as Discount[] | null) ?? [];
  const amazonUrl = p.amazonUrl ?? buildAmazonUrl(p.asin);
  const keepaUrl  = p.keepaLink ?? buildKeepaUrl(p.asin);

  // ─── Phase 1: AI Sourcing Experience ───────────────────────────────────────
  // Every value below is derived deterministically from already-persisted
  // Product fields (and keepaHistory) by the engines in src/engines/ — see
  // confidence.ts, timeline.ts, riskPresentation.ts, historicalInsights.ts.
  const history: KeepaHistorySnapshot | null = (p.keepaHistory as KeepaHistorySnapshot | null) ?? null;

  const confidence = buildConfidence({
    score:            lead.score,
    roi:              p.roi,
    demandLevel:      p.demandLevel,
    gatingRisk:       p.gatingRisk,
    priceStability:   (p.priceStability as 'STABLE' | 'VOLATILE' | 'UNKNOWN') ?? 'UNKNOWN',
    priceTrend:       p.priceTrend as 'RISING' | 'FLAT' | 'DECLINING' | 'UNKNOWN' | null,
    totalSellers:     p.totalSellers ?? 0,
    fbaSellers:       p.fbaSellers ?? 0,
    amazonIsSeller:   p.amazonIsSeller,
    buyBoxSuppressed: p.buyBoxSuppressed,
    rating:           p.rating,
    reviewCount:      p.reviewCount,
    lowReviews:        p.lowReviews,
    monthlySales:     p.monthlySales,
    keepaHistory:     history,
  });

  const timeline = buildTimeline(history);

  const riskBreakdown = buildRiskBreakdown({
    priceStability:    (p.priceStability as 'STABLE' | 'VOLATILE' | 'UNKNOWN') ?? 'UNKNOWN',
    priceTrend:        p.priceTrend as 'RISING' | 'FLAT' | 'DECLINING' | 'UNKNOWN' | null,
    totalSellers:      p.totalSellers ?? 0,
    amazonIsSeller:    p.amazonIsSeller,
    buyBoxSuppressed:  p.buyBoxSuppressed,
    ipRiskScore:       p.ipRiskScore,
    isPrivateLabel:    p.isPrivateLabel,
    isBrandRestricted: p.isBrandRestricted,
    isGenericBrand:    p.isGenericBrand,
    hasHazmat:         p.hasHazmat,
    isMeltable:        p.isMeltable,
    amazonAbsentPct:   history ? amazonPresence(history)?.absentPct : undefined,
  });

  const historicalInsights = buildHistoricalInsights(history);

  function ScoreRow({ label, value, pass, tip }: { label: string; value?: number | null; pass?: boolean; tip?: string }) {
    const pct = value ?? 0;
    return (
      <div className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0" title={tip}>
        <span className="text-sm text-slate-300">{label}</span>
        <div className="flex items-center gap-2">
          <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${pct >= 95 ? 'bg-green-500' : pct >= 70 ? 'bg-amber-400' : 'bg-red-400'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs font-mono w-10 text-right text-slate-200">{pct.toFixed(0)}%</span>
          {pass != null && (pass
            ? <CheckCircle2 className="w-4 h-4 text-green-500" />
            : <XCircle className="w-4 h-4 text-red-400" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      {/* Back */}
      <Link href="/dashboard/leads" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 mb-5">
        <ArrowLeft className="w-4 h-4" />Back to Lead Feed
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <ProductHero asin={p.asin} imageUrl={p.imageUrl} title={p.title} />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-slate-50 leading-snug">{p.title}</h1>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <span className="font-mono text-xs text-slate-400">{p.asin}</span>
            {p.brand && <span className="text-xs text-slate-400">{p.brand}</span>}
            {p.category && <span className="badge bg-slate-800 text-slate-300">{p.category}</span>}
            {p.onSale && (
              <span className="badge bg-orange-500/15 text-orange-400 font-semibold">
                🏷 SALE{p.sourceListPrice != null ? ` · was ${formatCurrency(p.sourceListPrice)}` : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-3">
            <a href={amazonUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs py-1.5">
              <ExternalLink className="w-3.5 h-3.5" />Amazon
            </a>
            <a href={keepaUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs py-1.5">
              <TrendingUp className="w-3.5 h-3.5" />Keepa
            </a>
            {p.sourceUrl && (
              <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs py-1.5">
                <ExternalLink className="w-3.5 h-3.5" />{p.sourceRetailer ?? 'Source'}
              </a>
            )}
            {lead.status === 'PURCHASED' ? (
              linkedPOItem ? (
                <Link
                  href={`/dashboard/orders/${linkedPOItem.purchaseOrderId}`}
                  className="btn-secondary text-xs py-1.5"
                >
                  <Package className="w-3.5 h-3.5" />Ordered →
                </Link>
              ) : (
                <span className="badge bg-green-500/15 text-green-400 text-xs py-1.5 px-2">
                  Purchased
                </span>
              )
            ) : lead.status !== 'REJECTED' && (
              <CreateOrderModal
                triggerLabel="Create PO"
                prefill={{
                  leadId:      lead.id,
                  productName: p.title,
                  asin:        p.asin,
                  sourceUrl:   p.sourceUrl ?? undefined,
                  unitCost:    p.sourcePrice ?? undefined,
                }}
              />
            )}
            {linkedInventory && (
              <Link href="/dashboard/inventory" className="btn-secondary text-xs py-1.5">
                <BarChart3 className="w-3.5 h-3.5" />View in Inventory →
              </Link>
            )}
          </div>
        </div>
        {/* Score */}
        <div className="flex-shrink-0 text-center">
          <div className={`text-4xl font-black ${color}`}>{Math.round(lead.score)}</div>
          <div className={`text-sm font-bold ${color}`}>{label}</div>
          <div className="text-xs text-slate-500 mt-1">Lead Score</div>
        </div>
      </div>

      <div className="mb-6">
        <ConfidencePanel result={confidence} />
      </div>

      <IpHistoryFlag
        productId={p.id}
        initialFlagged={p.hasIpComplaintHistory}
        initialNote={p.ipComplaintNote}
        canEdit={session!.user.role === 'OWNER'}
      />

      {/* Match verification — title matches are fuzzy and must be confirmed */}
      {(() => {
        const verified = p.matchMethod === 'UPC' || p.matchMethod === 'EAN';
        return (
          <div className={`rounded-xl border px-4 py-3 mb-6 flex gap-3 ${verified ? 'bg-green-500/10 border-green-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
            {verified
              ? <ShieldCheck className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
              : <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />}
            <div className="min-w-0">
              {verified ? (
                <p className="text-sm text-green-300">
                  <span className="font-semibold">Barcode-verified match (UPC/EAN).</span> Matched to Amazon by exact identifier — high confidence.
                </p>
              ) : (
                <>
                  <p className="text-sm text-amber-300 font-semibold">Verify this match before buying</p>
                  <p className="text-xs text-amber-200/90 leading-relaxed mt-0.5">
                    Matched by title similarity ({(p.matchConfidence ?? 0).toFixed(0)}%), not a barcode. Open both listings and confirm the
                    {' '}<strong>brand, model, and pack/quantity</strong> match — fuzzy matches can pair a single item with a multipack or a different variant.
                  </p>
                </>
              )}
              <div className="flex flex-wrap gap-2 mt-2">
                <a href={amazonUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs py-1">
                  <ExternalLink className="w-3 h-3" />Amazon listing
                </a>
                {p.sourceUrl && (
                  <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs py-1">
                    <ExternalLink className="w-3 h-3" />{p.sourceRetailer ?? 'Source'} listing
                  </a>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Too-good-to-be-true ROI — usually a mismatch, not a goldmine */}
      {p.roiImplausible && (
        <div className="rounded-xl border px-4 py-3 mb-6 flex gap-3 bg-red-500/10 border-red-500/30">
          <TrendingUp className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm text-red-300 font-semibold">Unusually high ROI ({formatPercent(p.roi)}) — verify the match</p>
            <p className="text-xs text-red-200/90 leading-relaxed mt-0.5">
              An ROI this high is most often a <strong>wrong match</strong> — a single unit paired to a multipack listing,
              or a different product entirely — rather than a real deal. Open both listings and confirm the
              brand, model, and <strong>pack/quantity</strong> line up before buying.
            </p>
          </div>
        </div>
      )}

      {/* Variation caveat — child ASINs report parent-level demand data */}
      {p.isVariation && (
        <div className="rounded-xl border px-4 py-3 mb-6 flex gap-3 bg-amber-500/10 border-amber-500/30">
          <BarChart3 className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm text-amber-300 font-semibold">Variation listing (child ASIN)</p>
            <p className="text-xs text-amber-200/90 leading-relaxed mt-0.5">
              This is one variation of a parent listing{p.parentAsin ? ` (${p.parentAsin})` : ''}. BSR and review counts
              reflect the <strong>whole variation family</strong>, not this specific size/color — so demand may look
              stronger than this exact item actually sells. Verify your variation moves before buying deep.
            </p>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Profitability */}
        <div className="lg:col-span-2 space-y-5">
          {/* Formula */}
          <div className="card p-5">
            <h2 className="font-semibold text-slate-50 mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-green-400" />Profitability Breakdown
            </h2>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-slate-800/40 rounded-xl p-4">
                <div className="text-xs text-slate-400 mb-1">Net Profit</div>
                <div className={`text-2xl font-black ${p.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatCurrency(p.profit)}
                </div>
              </div>
              <div className="bg-slate-800/40 rounded-xl p-4">
                <div className="text-xs text-slate-400 mb-1">ROI</div>
                <div className={`text-2xl font-black ${p.roi >= 30 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatPercent(p.roi)}
                </div>
              </div>
            </div>

            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Profitability Formula
            </div>
            <ProfitabilityCalculator
              sourcePrice={p.sourcePrice ?? 0}
              sourceRetailer={p.sourceRetailer ?? null}
              originalDiscounts={discounts}
              originalFinalCost={p.finalCost ?? 0}
              originalProfit={p.profit}
              amazonFees={p.amazonFees ?? 0}
              prepFee={p.prepFee ?? null}
              taxAmount={p.taxAmount ?? null}
              resellPrice={p.lowestFbaPrice ?? p.price}
            />
          </div>

          {/* Sourcing notes */}
          <LeadNotes
            productId={p.id}
            initialNotes={p.notes}
            canEdit={session!.user.role === 'OWNER'}
          />

          {/* Amazon Data */}
          <div className="card p-5">
            <h2 className="font-semibold text-slate-50 mb-4">Amazon Market Data</h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              {[
                ['Buy Box Price',      p.buyBoxPrice != null ? formatCurrency(p.buyBoxPrice) : '—',           'The price that wins Amazon\'s featured "Add to Cart" spot'],
                ['Lowest FBA Price',   p.lowestFbaPrice != null ? formatCurrency(p.lowestFbaPrice) : '—',    'Lowest price offered by an FBA (Fulfilled by Amazon) seller'],
                ['BSR',                p.bsr != null ? `#${p.bsr.toLocaleString()}${p.isVariation ? ' (parent)' : ''}` : '—', 'Best Sellers Rank — lower number means it sells more frequently in its category'],
                ['BSR %',              p.bsrPercentage != null ? `Top ${p.bsrPercentage.toFixed(2)}%` : '—', 'How this product ranks compared to everything in its category (Top 1% = very fast seller)'],
                ['Est. Monthly Sales', p.monthlySales != null ? `~${p.monthlySales.toLocaleString()}/mo` : '—', 'Estimated units sold per month across all sellers, based on BSR'],
                ['Your Est. Share',    p.expectedUnitsPerSeller != null ? `~${p.expectedUnitsPerSeller.toFixed(1)} units/mo` : '—', 'Your estimated monthly sales share if you list at a competitive price'],
                ['Rating',             p.rating != null ? `${p.rating.toFixed(1)}★` : '—',                  'Average customer star rating (1–5)'],
                ['Reviews',            p.reviewCount != null ? `${p.reviewCount.toLocaleString()}${p.lowReviews ? ' ⚠️ new listing' : ''}` : '—', 'Total customer reviews — fewer than 10 may indicate a new or low-trust listing'],
                ['Buy Box Owner',      p.buyBoxSuppressed ? 'None (suppressed) ⚠️' : (p.buyBoxOwner ?? '—'), 'Seller currently winning the featured Buy Box — if suppressed, no one is winning it'],
                ['Amazon Sells It',    p.amazonOwnsBuyBox ? 'Yes ⚠️' : 'No ✓',                              'If Amazon itself is selling this item, it\'s very hard to win the Buy Box'],
                ['Demand Level',       p.demandLevel,                                                         'Overall demand rating based on BSR, monthly sales, and price trends'],
                ['Price Stability',    p.priceStability ?? '—',                                               'How much the price fluctuates — STABLE means predictable margins, VOLATILE means higher risk'],
                ['Price Trend',        p.priceTrend && p.priceTrend !== 'UNKNOWN'
                  ? `${p.priceTrend === 'DECLINING' ? '↓' : p.priceTrend === 'RISING' ? '↑' : '→'} ${p.priceTrend}${p.priceTrendPct != null ? ` (${p.priceTrendPct > 0 ? '+' : ''}${p.priceTrendPct}%)` : ''}${p.priceTrend === 'DECLINING' ? ' ⚠️' : ''}`
                  : '—',                                                                                       'Direction Amazon prices have moved recently — DECLINING means your margin could shrink'],
              ].map(([label, value, tip]) => (
                <div key={label as string} title={tip as string | undefined}>
                  <div className="text-xs text-slate-500">{label}</div>
                  <div className="text-sm font-medium text-slate-100 mt-0.5">{value}</div>
                </div>
              ))}
            </div>
          </div>

          <ExplanationPanel result={confidence} />
          <OpportunityTimeline events={timeline} currentLabel={confidence.recommendation} />
          <HistoricalInsights insights={historicalInsights} />
        </div>

        {/* Sidebar — Validation & Risk */}
        <div className="space-y-5">
          {/* Validation Scores */}
          <div className="card p-5">
            <h2 className="font-semibold text-slate-50 mb-3 flex items-center gap-2">
              {p.validationPassed
                ? <CheckCircle2 className="w-4 h-4 text-green-400" />
                : <XCircle className="w-4 h-4 text-red-400" />}
              Validation
            </h2>
            <ScoreRow label="Identity"  value={p.identityScore}  pass={(p.identityScore ?? 0)  >= 80} tip="Confidence that this product exists and is correctly identified on Amazon (ASIN, brand, title)" />
            <ScoreRow label="URL"       value={p.urlScore}        pass={(p.urlScore ?? 0)        >= 95} tip="Confidence that the source listing URL resolves and matches the expected retailer" />
            <ScoreRow label="Price"     value={p.priceScore}      pass={(p.priceScore ?? 0)      >= 70} tip="Confidence that the source price is current and the profit calculation is reliable" />
            <ScoreRow label="Inventory" value={p.inventoryScore}  pass={(p.inventoryScore ?? 0)  >= 95} tip="Confidence that the item is actually in stock and available to purchase from the source" />
            <ScoreRow label="Match"     value={p.matchConfidence} pass={(p.matchConfidence ?? 0) >= 80} tip="How closely the source listing matches the Amazon listing — 100% means barcode-verified (UPC/EAN)" />
            <div className="mt-3 text-xs text-slate-500">
              Identity &amp; Match ≥ 80%, Price ≥ 70%, URL &amp; Inventory ≥ 95%. Barcode (UPC/EAN) matches score 100%.
            </div>
          </div>

          {/* Risk Assessment */}
          <div className="card p-5">
            <h2 className="font-semibold text-slate-50 mb-3 flex items-center gap-2">
              {p.gatingRisk === 'LOW'
                ? <ShieldCheck className="w-4 h-4 text-green-400" />
                : p.gatingRisk === 'MEDIUM'
                ? <ShieldAlert className="w-4 h-4 text-amber-500" />
                : <ShieldX className="w-4 h-4 text-red-400" />}
              Risk Assessment
            </h2>

            {/* Ungating outlook — combined read of category + brand IP risk */}
            {(() => {
              const o = ungatingOutlook(p);
              const tone = o.tone === 'good' ? 'bg-green-500/10 border-green-500/30 text-green-300'
                         : o.tone === 'ok'   ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                         : o.tone === 'warn' ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                         :                     'bg-red-500/10 border-red-500/30 text-red-300';
              return (
                <div className={`rounded-xl border px-3 py-2.5 mb-3 ${tone}`}>
                  <div className="text-xs font-semibold uppercase tracking-wider opacity-70">Ungating outlook</div>
                  <div className="text-sm font-bold mt-0.5">{o.label}</div>
                  <div className="text-xs opacity-90 mt-1 leading-relaxed">{o.hint}</div>
                </div>
              );
            })()}

            <RiskBreakdownPanel breakdown={riskBreakdown} />

            <div className="space-y-2">
              {[
                ['IP Risk',      p.ipRiskScore ?? 'LOW', p.ipRiskScore === 'LOW'],
                ['Gating Risk',  p.gatingRisk,           p.gatingRisk  === 'LOW'],
                ['Auto-Ungated', p.autoUngated ? 'Yes' : 'No', p.autoUngated],
                ['Hazmat',       p.hasHazmat ? 'Yes ⚠️' : 'No', !p.hasHazmat],
                ['Brand Restricted', p.isBrandRestricted ? 'Yes ⚠️' : 'No', !p.isBrandRestricted],
                ['Category Gated',   p.isCategoryGated   ? 'Yes ⚠️' : 'No', !p.isCategoryGated],
                ['Private Label',    p.isPrivateLabel    ? 'Yes ⚠️' : 'No', !p.isPrivateLabel],
                ['Generic Brand',    p.isGenericBrand    ? 'Yes ⚠️' : 'No', !p.isGenericBrand],
                ['Meltable',         p.isMeltable        ? 'Yes ⚠️' : 'No', !p.isMeltable],
                ['Fee Estimate',     p.feeEstimateConfirmed ? 'Confirmed ✓' : 'Unconfirmed ⚠️', p.feeEstimateConfirmed],
              ].map(([label, value, good]) => (
                <div key={label as string} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                  <span className="text-sm text-slate-400">{label as string}</span>
                  <span className={`text-sm font-medium ${good ? 'text-green-400' : 'text-red-400'}`}>{value as string}</span>
                </div>
              ))}
              <div className="flex items-center justify-between py-1.5">
                <span className="text-sm text-slate-400">Fee Freshness</span>
                <FeeFreshnessBadge
                  feeEstimateSource={p.feeEstimateSource}
                  feeEstimatedAt={p.feeEstimatedAt}
                  feeEstimatePrice={p.feeEstimatePrice}
                  currentResellPrice={p.lowestFbaPrice}
                  referralFee={p.referralFee}
                  fbaFee={p.fbaFee}
                />
              </div>
            </div>
            {canShowFeeRefreshButton({ role: session!.user.role, isBroadcastSource }) && (
              <div className="mt-4 pt-4 border-t border-slate-800">
                <FeeRefreshButton leadId={lead.id} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
