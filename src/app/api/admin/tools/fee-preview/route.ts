/**
 * POST /api/admin/tools/fee-preview
 *
 * Admin-only read-only route. Calls the SP-API Product Fees endpoint for a
 * single ASIN at a given resell price, then computes estimated profit.
 *
 * Safety:
 * - Does NOT create SourceCandidate, Product, Lead, or LeadEntitlement records.
 * - Does NOT write any database rows.
 * - Does NOT trigger scanner jobs, repricing, or broadcasting.
 * - Does NOT interact with Amazon OAuth or credential rotation.
 * - All SP-API access is read-only (getMyFeesEstimate POST — a query, not a mutation).
 * - Uses the platform OWNER org's SP-API credentials (orgId from OWNER session user).
 * - Never falls back to static/rate-table fee estimates. If SP-API returns null
 *   or throws, the response carries feeStatus: 'SP_API_FEE_UNAVAILABLE' with no
 *   fee amounts — not a guessed substitute.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { isPlatformAdmin } from '@/lib/admin';
import { getFeeEstimate } from '@/lib/amazon';

export const dynamic    = 'force-dynamic';
export const maxDuration = 30;

export type FeeStatus = 'SP_API_SUCCESS' | 'SP_API_FEE_UNAVAILABLE';

// ── Auth guard (reused pattern from brand-blocks / walmart-refresh-preview) ───

function isPrivileged(session: { user: { role: string; email: string } } | null): boolean {
  if (!session) return false;
  return session.user.role === 'OWNER' || isPlatformAdmin(session.user.email);
}

// ── Input shape ───────────────────────────────────────────────────────────────

interface FeePreviewBody {
  asin:          string;
  resellPrice:   number;
  sourceCost:    number;
  sourceTaxRate: number;
  category:      string; // informational only — NOT used for fee calculation
}

function validateBody(raw: unknown): { ok: true; body: FeePreviewBody } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Request body must be a JSON object.' };
  const b = raw as Record<string, unknown>;

  const normalizedAsin = typeof b.asin === 'string' ? b.asin.trim().toUpperCase() : '';
  if (!normalizedAsin || !/^[A-Z0-9]{10}$/.test(normalizedAsin)) {
    return { ok: false, error: 'asin must be a 10-character alphanumeric Amazon ASIN.' };
  }
  if (typeof b.resellPrice !== 'number' || b.resellPrice <= 0) {
    return { ok: false, error: 'resellPrice must be a positive number.' };
  }
  if (typeof b.sourceCost !== 'number' || b.sourceCost <= 0) {
    return { ok: false, error: 'sourceCost must be a positive number.' };
  }
  if (typeof b.sourceTaxRate !== 'number' || b.sourceTaxRate < 0 || b.sourceTaxRate > 1) {
    return { ok: false, error: 'sourceTaxRate must be a number between 0 and 1 (e.g. 0.086).' };
  }
  if (typeof b.category !== 'string' || !b.category.trim()) {
    return { ok: false, error: 'category must be a non-empty string.' };
  }

  return {
    ok: true,
    body: {
      asin:          normalizedAsin,
      resellPrice:   b.resellPrice,
      sourceCost:    b.sourceCost,
      sourceTaxRate: b.sourceTaxRate,
      category:      b.category.trim(),
    },
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth
  const session = await auth();
  if (!isPrivileged(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: session ? 403 : 401 });
  }

  // Parse + validate body
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const validated = validateBody(raw);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const { asin, resellPrice, sourceCost, sourceTaxRate, category } = validated.body;
  const orgId = session!.user.orgId;

  // SP-API fee lookup — wrapped in try/catch so internal errors never leak
  // token values, credential details, or raw exception messages.
  let fees: { referralFee: number; fbaFee: number } | null = null;
  try {
    fees = await getFeeEstimate(orgId, asin, resellPrice);
  } catch {
    // Swallow — any throw is treated identically to a null return.
    // The internal error is already logged inside getFeeEstimate.
    fees = null;
  }

  // SP-API unavailable — return a clear status with no fee amounts.
  // Never substitute static/rate-table estimates.
  if (fees === null) {
    return NextResponse.json({
      ok:        false,
      feeStatus: 'SP_API_FEE_UNAVAILABLE' as FeeStatus,
      asin,
      resellPrice,
      sourceCost,
      sourceTaxRate,
      category,
      message:   'SP-API fee estimate unavailable. No candidate, product, or lead was created.',
    });
  }

  // SP-API success — compute real economics from confirmed fees only.
  const taxedSourceCost  = parseFloat((sourceCost * (1 + sourceTaxRate)).toFixed(2));
  const referralFee      = parseFloat(fees.referralFee.toFixed(2));
  const fbaFee           = parseFloat(fees.fbaFee.toFixed(2));
  const totalAmazonFees  = parseFloat((referralFee + fbaFee).toFixed(2));
  const estimatedProfit  = parseFloat((resellPrice - taxedSourceCost - totalAmazonFees).toFixed(2));
  const estimatedRoi     = taxedSourceCost > 0
    ? parseFloat(((estimatedProfit / taxedSourceCost) * 100).toFixed(1))
    : null;

  return NextResponse.json({
    ok:        true,
    feeStatus: 'SP_API_SUCCESS' as FeeStatus,
    asin,
    resellPrice,
    sourceCost,
    sourceTaxRate,
    taxedSourceCost,
    category,
    // SP-API confirmed fees
    referralFee,
    fbaFee,
    totalAmazonFees,
    // Economics
    estimatedProfit,
    estimatedRoi,
    // Explicit reminder — the tool is read-only
    message: 'SP-API fees confirmed. Preview only — no candidate, product, or lead was created.',
  });
}
