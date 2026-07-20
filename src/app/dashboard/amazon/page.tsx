import Link from 'next/link';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ConnectForm } from '@/components/amazon/ConnectForm';
import { DisconnectButton } from '@/components/amazon/DisconnectButton';
import { PageGuide } from '@/components/ui/PageGuide';
import { CheckCircle2, XCircle, AlertTriangle, ShoppingBag } from 'lucide-react';

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

  const orgId = session!.user.orgId;
  const cred  = await prisma.amazonCredential.findUnique({
    where: { orgId },
    select: { sellerId: true, marketplaceId: true, isActive: true, updatedAt: true },
  });

  const isConnected = !!cred?.isActive;
  const isOwner     = session!.user.role === 'OWNER';
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

      {/* Beginner guide */}
      <PageGuide
        storageKey="amazon-guide-collapsed"
        title="How your Amazon connection works"
        subtitle="Connect once, then use live Amazon data for inventory and pricing workflows."
        steps={[
          { title: '1. Connect your seller account', body: 'Click Connect below and complete the Amazon authorization flow. You will be redirected back here when done.' },
          { title: '2. Confirm the connection is active', body: 'The status badge on this page turns green when your credentials are valid. If it shows an error, reconnect.' },
          { title: '3. Use live data safely', body: 'Once connected, Inventory Sync pulls your FBA stock from Seller Central, and Repricing can fetch and push live listing prices.' },
        ]}
        columns={3}
      />

      <p className="text-xs text-slate-500">
        Need step-by-step instructions?{' '}
        <Link href="/dashboard/amazon/guide" className="text-blue-500 hover:text-blue-400">
          View the full SP-API setup guide →
        </Link>
      </p>

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
          {/* Non-owner explanation */}
          {!isOwner && (
            <div className="bg-slate-800/60 rounded-xl px-4 py-3 flex gap-2">
              <AlertTriangle className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-slate-400">
                Only the account owner can connect or reconnect Amazon SP-API.
                Ask your account owner to complete this setup.
              </p>
            </div>
          )}

          {/* Primary: OAuth button — owner only until app is published */}
          {isOwner && (
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
          )}

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
              ['Inventory Sync', 'Pull current FBA inventory levels'],
              ['Listings API', 'Update listing prices and quantities'],
              ['Reports API', 'Download settlement and reimbursement reports'],
            ].map(([name, desc]) => (
              <div
                key={name as string}
                className="rounded-xl border p-4 border-green-500/30 bg-green-500/10"
              >
                <div className="font-medium text-slate-100 text-sm">{name as string}</div>
                <div className="text-xs text-slate-400 mt-1">{desc as string}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
