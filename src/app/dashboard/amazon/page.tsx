import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ConnectForm } from '@/components/amazon/ConnectForm';
import { DisconnectButton } from '@/components/amazon/DisconnectButton';
import { CheckCircle2, XCircle, Zap, AlertTriangle, ShoppingBag } from 'lucide-react';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Amazon SP-API' };

interface Props {
  searchParams: Promise<{ connected?: string; error?: string }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_state:        'Authorization failed: invalid state. Please try again.',
  missing_code:         'Amazon did not return an authorization code. Please try again.',
  token_exchange_failed:'Could not exchange the authorization code for tokens. Please try again.',
  missing_credentials:  'Server configuration error: Amazon API credentials are not set.',
  server_error:         'An unexpected error occurred. Please try again.',
};

export default async function AmazonPage({ searchParams: searchParamsPromise }: Props) {
  const [session, searchParams] = await Promise.all([auth(), searchParamsPromise]);
  const plan = session!.user.plan;

  if (plan === 'STARTER') {
    return (
      <div className="p-6 lg:p-8 max-w-xl">
        <div className="card p-10 text-center">
          <div className="w-14 h-14 bg-amber-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Zap className="w-7 h-7 text-amber-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-50 mb-2">Amazon SP-API requires Pro</h2>
          <p className="text-slate-400 text-sm mb-5">
            Connect your Amazon Seller Central account to sync inventory, update listings, and automate repricing.
          </p>
          <a href="/dashboard/billing" className="btn-primary">Upgrade to Pro →</a>
        </div>
      </div>
    );
  }

  const orgId = session!.user.orgId;
  const cred  = await prisma.amazonCredential.findUnique({
    where: { orgId },
    select: { sellerId: true, marketplaceId: true, isActive: true, updatedAt: true },
  });

  const isConnected = !!cred?.isActive;
  const errorMsg    = searchParams.error ? (ERROR_MESSAGES[searchParams.error] ?? 'An error occurred. Please try again.') : null;

  return (
    <div className="p-6 lg:p-8 max-w-2xl space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Amazon SP-API</h1>
          <p className="page-subtitle">Connect your Amazon Seller Central account</p>
        </div>
      </div>

      {/* Success banner */}
      {searchParams.connected === 'true' && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3 flex gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-400">Amazon account connected successfully.</p>
        </div>
      )}

      {/* Error banner */}
      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 flex gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-400">{errorMsg}</p>
        </div>
      )}

      {/* Connection status */}
      <div className={`card p-5 ${isConnected ? 'border-green-500/30 bg-green-500/10' : ''}`}>
        <div className="flex items-center gap-3">
          {isConnected
            ? <CheckCircle2 className="w-6 h-6 text-green-500" />
            : <XCircle className="w-6 h-6 text-slate-600" />}
          <div>
            <div className="font-semibold text-slate-50">
              {isConnected ? 'Connected' : 'Not connected'}
            </div>
            {isConnected && cred && (
              <div className="text-xs text-slate-400 mt-0.5">
                Seller ID: {cred.sellerId} · Marketplace: {cred.marketplaceId}
              </div>
            )}
          </div>
          {isConnected && <DisconnectButton />}
        </div>
      </div>

      {/* Connect options */}
      {!isConnected && (
        <div className="space-y-4">
          {/* Primary: OAuth button */}
          <div className="card p-6">
            <h2 className="font-semibold text-slate-50 mb-1">Connect with Amazon</h2>
            <p className="text-sm text-slate-400 mb-5">
              Authorize EALLsource to access your Seller Central account. You will be redirected to
              Amazon to approve access — no tokens to copy or paste.
            </p>
            <a
              href="/api/amazon/oauth/start"
              className="btn-primary w-full justify-center text-center flex items-center gap-2"
            >
              <ShoppingBag className="w-4 h-4" />
              Connect with Amazon
            </a>
          </div>

          {/* Secondary: manual / advanced */}
          <details className="card p-6 group">
            <summary className="cursor-pointer text-sm font-medium text-slate-400 hover:text-slate-200 select-none list-none flex items-center justify-between">
              <span>Manual setup (advanced)</span>
              <span className="text-slate-600 group-open:rotate-180 transition-transform">▾</span>
            </summary>

            <div className="mt-5">
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 mb-5 flex gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-400">
                  Manual setup requires a registered SP-API application and a self-generated refresh token.
                  Use the button above unless you have a specific reason to enter tokens manually.
                </p>
              </div>
              <ConnectForm />
            </div>
          </details>
        </div>
      )}

      {/* Available integrations */}
      {isConnected && (
        <div className="card p-5">
          <h2 className="font-semibold text-slate-50 mb-4">Available Integrations</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              ['Inventory Sync', 'Pull current FBA inventory levels', true],
              ['Listings API', 'Update listing prices and quantities', true],
              ['Orders API', 'Track sales and fulfilled orders', true],
              ['Reports API', 'Download settlement and inventory reports', false],
            ].map(([name, desc, active]) => (
              <div
                key={name as string}
                className={`rounded-xl border p-4 ${active ? 'border-green-500/30 bg-green-500/10' : 'border-slate-800 bg-slate-800/40 opacity-60'}`}
              >
                <div className="font-medium text-slate-100 text-sm">{name as string}</div>
                <div className="text-xs text-slate-400 mt-1">{desc as string}</div>
                {!active && <div className="text-xs text-amber-400 mt-2">Coming soon</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
