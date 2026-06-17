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

export const dynamic = 'force-dynamic';

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id }  = await params;

  const product = await prisma.product.findFirst({
    where: { id, orgId: session!.user.orgId },
    include: {
      leads: {
        where: { orgId: session!.user.orgId },
        select: { id: true, status: true },
        take: 1,
      },
    },
  });

  if (!product) notFound();

  const p          = product;
  const lead       = product.leads[0] ?? null;
  const { label, color } = scoreLabel(p.score);
  const discounts  = (p.availableDiscounts as Discount[] | null) ?? [];
  const amazonUrl  = p.amazonUrl ?? buildAmazonUrl(p.asin);
  const keepaUrl   = p.keepaLink ?? buildKeepaUrl(p.asin);

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      <div className="flex items-center gap-3 mb-5">
        <Link href="/dashboard/products" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="w-4 h-4" />Back to Products
        </Link>
        {lead && (
          <>
            <span className="text-slate-300">·</span>
            <Link href={`/dashboard/leads/${lead.id}`} className="inline-flex items-center gap-1 text-sm text-orange-600 hover:text-orange-700">
              View Lead <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </>
        )}
      </div>

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
            {p.brand    && <span className="text-xs text-slate-500">{p.brand}</span>}
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
        <div className="flex-shrink-0 text-center">
          <div className={`text-4xl font-black ${color}`}>{Math.round(p.score)}</div>
          <div className={`text-sm font-bold ${color}`}>{label}</div>
          <div className="text-xs text-slate-400 mt-1">Score</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {/* Profitability */}
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

            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">
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

          {/* Amazon Data */}
          <div className="card p-5">
            <h2 className="font-semibold text-slate-900 mb-4">Amazon Market Data</h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              {[
                ['Buy Box Price',   p.buyBoxPrice    != null ? formatCurrency(p.buyBoxPrice)          : '—'],
                ['Lowest FBA Price',p.lowestFbaPrice != null ? formatCurrency(p.lowestFbaPrice)       : '—'],
                ['BSR',             p.bsr            != null ? `#${p.bsr.toLocaleString()}`           : '—'],
                ['BSR %',           p.bsrPercentage  != null ? `Top ${p.bsrPercentage.toFixed(2)}%`  : '—'],
                ['Buy Box Owner',   p.buyBoxOwner    ?? '—'],
                ['Amazon Sells It', p.amazonOwnsBuyBox ? 'Yes ⚠️' : 'No ✓'],
                ['Demand Level',    p.demandLevel],
                ['Price Stability', (p as any).priceStability ?? '—'],
              ].map(([lbl, val]) => (
                <div key={lbl as string}>
                  <div className="text-xs text-slate-400">{lbl}</div>
                  <div className="text-sm font-medium text-slate-800 mt-0.5">{val}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Validation */}
          <div className="card p-5">
            <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              {p.validationPassed
                ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                : <XCircle className="w-4 h-4 text-red-500" />}
              Validation
            </h2>
            {[
              ['Identity',  (p as any).identityScore,  ((p as any).identityScore  ?? 0) >= 95],
              ['URL',       (p as any).urlScore,        ((p as any).urlScore       ?? 0) >= 95],
              ['Price',     (p as any).priceScore,      ((p as any).priceScore     ?? 0) >= 95],
              ['Inventory', (p as any).inventoryScore,  ((p as any).inventoryScore ?? 0) >= 95],
              ['Match',     (p as any).matchConfidence, ((p as any).matchConfidence ?? 0) >= 70],
            ].map(([lbl, val, pass]) => (
              <div key={lbl as string} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                <span className="text-sm text-slate-600">{lbl as string}</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${(val as number) >= 95 ? 'bg-green-500' : (val as number) >= 70 ? 'bg-amber-400' : 'bg-red-400'}`}
                      style={{ width: `${val ?? 0}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono w-10 text-right text-slate-700">{((val as number) ?? 0).toFixed(0)}%</span>
                  {(pass as boolean)
                    ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                    : <XCircle className="w-4 h-4 text-red-400" />}
                </div>
              </div>
            ))}
            <div className="mt-3 text-xs text-slate-400">All scores must be ≥ 95% to display. Match ≥ 70%.</div>
          </div>

          {/* Risk */}
          <div className="card p-5">
            <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              {p.gatingRisk === 'LOW'
                ? <ShieldCheck className="w-4 h-4 text-green-600" />
                : p.gatingRisk === 'MEDIUM'
                ? <ShieldAlert className="w-4 h-4 text-amber-500" />
                : <ShieldX    className="w-4 h-4 text-red-500" />}
              Risk Assessment
            </h2>
            <div className="space-y-2">
              {[
                ['IP Risk',           p.ipRiskScore ?? 'LOW',          p.ipRiskScore !== 'HIGH'],
                ['Gating Risk',       p.gatingRisk,                    p.gatingRisk  === 'LOW'],
                ['Auto-Ungated',      p.autoUngated ? 'Yes' : 'No',   p.autoUngated],
                ['Hazmat',            (p as any).hasHazmat ? 'Yes ⚠️' : 'No',  !(p as any).hasHazmat],
                ['Brand Restricted',  (p as any).isBrandRestricted ? 'Yes ⚠️' : 'No', !(p as any).isBrandRestricted],
                ['Category Gated',    (p as any).isCategoryGated   ? 'Yes ⚠️' : 'No', !(p as any).isCategoryGated],
              ].map(([lbl, val, good]) => (
                <div key={lbl as string} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                  <span className="text-sm text-slate-500">{lbl as string}</span>
                  <span className={`text-sm font-medium ${good ? 'text-green-600' : 'text-red-500'}`}>{val as string}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
