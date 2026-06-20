import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
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
import { LeadNotes } from '@/components/leads/LeadNotes';
import { ungatingOutlook } from '@/engines/gating';

export const dynamic = 'force-dynamic';

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id }  = await params;

  const lead = await prisma.lead.findFirst({
    where: { id, orgId: session!.user.orgId },
    include: { product: true },
  });

  if (!lead) notFound();

  const p = lead.product;
  const { label, color } = scoreLabel(lead.score);
  const discounts = (p.availableDiscounts as Discount[] | null) ?? [];
  const amazonUrl = p.amazonUrl ?? buildAmazonUrl(p.asin);
  const keepaUrl  = p.keepaLink ?? buildKeepaUrl(p.asin);

  function ScoreRow({ label, value, pass }: { label: string; value?: number | null; pass?: boolean }) {
    const pct = value ?? 0;
    return (
      <div className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
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
        {p.imageUrl ? (
          <img src={p.imageUrl} alt={p.title} className="w-20 h-20 object-contain rounded-xl border border-slate-800 bg-slate-900 flex-shrink-0" />
        ) : (
          <div className="w-20 h-20 rounded-xl border border-slate-800 bg-slate-800/40 flex items-center justify-center flex-shrink-0">
            <Package className="w-8 h-8 text-slate-600" />
          </div>
        )}
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
          </div>
        </div>
        {/* Score */}
        <div className="flex-shrink-0 text-center">
          <div className={`text-4xl font-black ${color}`}>{Math.round(lead.score)}</div>
          <div className={`text-sm font-bold ${color}`}>{label}</div>
          <div className="text-xs text-slate-500 mt-1">Lead Score</div>
        </div>
      </div>

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
                ['Buy Box Price', p.buyBoxPrice != null ? formatCurrency(p.buyBoxPrice) : '—'],
                ['Lowest FBA Price', p.lowestFbaPrice != null ? formatCurrency(p.lowestFbaPrice) : '—'],
                ['BSR', p.bsr != null ? `#${p.bsr.toLocaleString()}` : '—'],
                ['BSR %', p.bsrPercentage != null ? `Top ${p.bsrPercentage.toFixed(2)}%` : '—'],
                ['Buy Box Owner', p.buyBoxOwner ?? '—'],
                ['Amazon Sells It', p.amazonOwnsBuyBox ? 'Yes ⚠️' : 'No ✓'],
                ['Demand Level', p.demandLevel],
                ['Price Stability', p.priceStability ?? '—'],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <div className="text-xs text-slate-500">{label}</div>
                  <div className="text-sm font-medium text-slate-100 mt-0.5">{value}</div>
                </div>
              ))}
            </div>
          </div>
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
            <ScoreRow label="Identity"  value={p.identityScore}  pass={(p.identityScore ?? 0)  >= 80} />
            <ScoreRow label="URL"       value={p.urlScore}        pass={(p.urlScore ?? 0)        >= 95} />
            <ScoreRow label="Price"     value={p.priceScore}      pass={(p.priceScore ?? 0)      >= 70} />
            <ScoreRow label="Inventory" value={p.inventoryScore}  pass={(p.inventoryScore ?? 0)  >= 95} />
            <ScoreRow label="Match"     value={p.matchConfidence} pass={(p.matchConfidence ?? 0) >= 80} />
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

            <div className="space-y-2">
              {[
                ['IP Risk',      p.ipRiskScore ?? 'LOW', p.ipRiskScore === 'LOW'],
                ['Gating Risk',  p.gatingRisk,           p.gatingRisk  === 'LOW'],
                ['Auto-Ungated', p.autoUngated ? 'Yes' : 'No', p.autoUngated],
                ['Hazmat',       p.hasHazmat ? 'Yes ⚠️' : 'No', !p.hasHazmat],
                ['Brand Restricted', p.isBrandRestricted ? 'Yes ⚠️' : 'No', !p.isBrandRestricted],
                ['Category Gated',   p.isCategoryGated   ? 'Yes ⚠️' : 'No', !p.isCategoryGated],
              ].map(([label, value, good]) => (
                <div key={label as string} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                  <span className="text-sm text-slate-400">{label as string}</span>
                  <span className={`text-sm font-medium ${good ? 'text-green-400' : 'text-red-400'}`}>{value as string}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
