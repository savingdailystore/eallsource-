import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ConnectForm } from '@/components/amazon/ConnectForm';
import { DisconnectButton } from '@/components/amazon/DisconnectButton';
import { CheckCircle2, XCircle, Zap, AlertTriangle } from 'lucide-react';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Amazon SP-API' };

export default async function AmazonPage() {
  const session = await auth();
  const plan    = session!.user.plan;

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

  return (
    <div className="p-6 lg:p-8 max-w-2xl space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Amazon SP-API</h1>
          <p className="page-subtitle">Connect your Amazon Seller Central account</p>
        </div>
      </div>

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

      {/* Connect form */}
      {!isConnected && (
        <div className="card p-6">
          <h2 className="font-semibold text-slate-50 mb-1">Connect Amazon Seller Account</h2>
          <p className="text-sm text-slate-400 mb-5">
            Enter your SP-API credentials. Tokens are encrypted with AES-256-GCM before storage.
          </p>

          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 mb-5 flex gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-400">
              You must have a registered SP-API application. See{' '}
              <a
                href="https://developer-docs.amazon.com/sp-api/docs/registering-your-application"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-medium"
              >
                SP-API documentation
              </a>.
            </p>
          </div>

          <ConnectForm />
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
