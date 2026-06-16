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
import { discountUrl } from '@/lib/discount-urls';

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
        <span className="text-sm text-slate-600">{label}</span>
        <div className="flex items-center gap-2">
          <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${pct >= 95 ? 'bg-green-500' : pct >= 70 ? 'bg-amber-400' : 'bg-red-400'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs font-mono w-10 text-right text-slate-700">{pct.toFixed(0)}%</span>
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
      <Link href="/dashboard/leads" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-5">
        <ArrowLeft className="w-4 h-4" />Back to Lead Feed
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        {p.imageUrl ? (
          <img src={p.imageUrl} alt={p.title} className="w-20 h-20 object-contain rounded-xl border border-slate-100 bg-white flex-shrink-0" />
        ) : (
          <div className="w-20 h-20 rounded-xl border border-slate-100 bg-slate-50 flex items-center justify-center flex-shrink-0">
            <Package className="w-8 h-8 text-slate-300" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-slate-900 leading-snug">{p.title}</h1>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <span className="font-mono text-xs text-slate-500">{p.asin}</span>
            {p.brand && <span className="text-xs text-slate-500">{p.brand}</span>}
            {p.category && <span className="badge bg-slate-100 text-slate-600">{p.category}</span>}
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
          <div className="text-xs text-slate-400 mt-1">Lead Score</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Profitability */}
        <div className="lg:col-span-2 space-y-5">
          {/* Formula */}
          <div className="card p-5">
            <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-green-600" />Profitability Breakdown
            </h2>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-slate-50 rounded-xl p-4">
                <div className="text-xs text-slate-500 mb-1">Net Profit</div>
                <div className={`text-2xl font-black ${p.profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {formatCurrency(p.profit)}
                </div>
              </div>
              <div className="bg-slate-50 rounded-xl p-4">
                <div className="text-xs text-slate-500 mb-1">ROI</div>
                <div className={`text-2xl font-black ${p.roi >= 30 ? 'text-green-600' : 'text-red-500'}`}>
                  {formatPercent(p.roi)}
                </div>
              </div>
            </div>

            {/* Source cost */}
            <div className="space-y-1 mb-3">
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Source Cost</div>
              {p.sourcePrice != null && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Source Price ({p.sourceRetailer})</span>
                  <span className="font-medium">{formatCurrency(p.sourcePrice)}</span>
                </div>
              )}
              {discounts.map((d, i) => {
                const url = discountUrl(d.source, p.sourceRetailer ?? '', d.url);
                const isCashback = d.type === 'cashback' || d.type === 'rewards';
                return (
                  <div key={i} className="flex justify-between text-sm gap-2">
                    <span className="text-green-600 flex items-center gap-1.5 min-w-0 flex-wrap">
                      <span>−</span>
                      {url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 decoration-green-400 hover:text-green-700 flex items-center gap-1">
                          {d.source}
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        </a>
                      ) : (
                        <span>{d.source}</span>
                      )}
                      <span className="text-green-500">{d.type}</span>
                      {d.code && <span className="font-mono text-xs bg-green-50 border border-green-100 px-1 rounded">{d.code}</span>}
                      {d.percentage && (
                        <span title={isCashback ? 'Rate at scan time — verify before purchasing' : undefined}>
                          {isCashback ? `~${d.percentage}%` : `${d.percentage}%`}
                        </span>
                      )}
                    </span>
                    <span className="text-green-600 font-medium flex-shrink-0">−{formatCurrency(d.amount)}</span>
                  </div>
                );
              })}
              {discounts.some((d) => d.type === 'cashback' || d.type === 'rewards') && (
                <p className="text-[10px] text-amber-600 mt-1">
                  ~ Cashback rates were captured at scan time and may have changed — click the link to verify the current rate before purchasing.
                </p>
              )}
              <div className="flex justify-between text-sm font-semibold border-t border-slate-100 pt-1 mt-1">
                <span>Final Cost</span>
                <span>{p.finalCost != null ? formatCurrency(p.finalCost) : '—'}</span>
              </div>
            </div>

            {/* Deductions */}
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Deductions from Resell Price ({formatCurrency(p.lowestFbaPrice ?? p.price)})
              </div>
              {p.amazonFees != null && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Amazon Fees (referral + FBA)</span>
                  <span className="text-red-500">−{formatCurrency(p.amazonFees)}</span>
                </div>
              )}
              {p.prepFee != null && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Prep Fee</span>
                  <span className="text-red-500">−{formatCurrency(p.prepFee)}</span>
                </div>
              )}
              {p.taxAmount != null && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Tax</span>
                  <span className="text-red-500">−{formatCurrency(p.taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold border-t border-slate-100 pt-1 mt-1">
                <span>Net Profit</span>
                <span className={p.profit >= 0 ? 'text-green-600' : 'text-red-500'}>{formatCurrency(p.profit)}</span>
              </div>
              <div className="text-xs text-slate-400 mt-1">
                ROI = (Net Profit ÷ Final Cost) × 100 = {formatPercent(p.roi)}
              </div>
            </div>
          </div>

          {/* Amazon Data */}
          <div className="card p-5">
            <h2 className="font-semibold text-slate-900 mb-4">Amazon Market Data</h2>
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
                  <div className="text-xs text-slate-400">{label}</div>
                  <div className="text-sm font-medium text-slate-800 mt-0.5">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar — Validation & Risk */}
        <div className="space-y-5">
          {/* Validation Scores */}
          <div className="card p-5">
            <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              {p.validationPassed
                ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                : <XCircle className="w-4 h-4 text-red-500" />}
              Validation
            </h2>
            <ScoreRow label="Identity"  value={p.identityScore}  pass={(p.identityScore ?? 0)  >= 95} />
            <ScoreRow label="URL"       value={p.urlScore}        pass={(p.urlScore ?? 0)        >= 95} />
            <ScoreRow label="Price"     value={p.priceScore}      pass={(p.priceScore ?? 0)      >= 95} />
            <ScoreRow label="Inventory" value={p.inventoryScore}  pass={(p.inventoryScore ?? 0)  >= 95} />
            <ScoreRow label="Match"     value={p.matchConfidence} pass={(p.matchConfidence ?? 0) >= 70} />
            <div className="mt-3 text-xs text-slate-400">
              All scores must be ≥ 95% to display. Match ≥ 70%.
            </div>
          </div>

          {/* Risk Assessment */}
          <div className="card p-5">
            <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              {p.gatingRisk === 'LOW'
                ? <ShieldCheck className="w-4 h-4 text-green-600" />
                : p.gatingRisk === 'MEDIUM'
                ? <ShieldAlert className="w-4 h-4 text-amber-500" />
                : <ShieldX className="w-4 h-4 text-red-500" />}
              Risk Assessment
            </h2>
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
                  <span className="text-sm text-slate-500">{label as string}</span>
                  <span className={`text-sm font-medium ${good ? 'text-green-600' : 'text-red-500'}`}>{value as string}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
