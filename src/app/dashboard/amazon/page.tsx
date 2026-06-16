import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ConnectForm } from '@/components/amazon/ConnectForm';
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
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(245,158,11,0.1)' }}>
            <Zap className="w-7 h-7 text-amber-400" />
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: '#fafafa' }}>Amazon SP-API requires Pro</h2>
          <p className="text-sm mb-5" style={{ color: '#71717a' }}>
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
      <div
        className="card p-5"
        style={isConnected ? { borderColor: 'rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.06)' } : {}}
      >
        <div className="flex items-center gap-3">
          {isConnected
            ? <CheckCircle2 className="w-6 h-6 text-green-400" />
            : <XCircle className="w-6 h-6" style={{ color: '#52525b' }} />}
          <div>
            <div className="font-semibold" style={{ color: '#fafafa' }}>
              {isConnected ? 'Connected' : 'Not connected'}
            </div>
            {isConnected && cred && (
              <div className="text-xs mt-0.5" style={{ color: '#71717a' }}>
                Seller ID: {cred.sellerId} · Marketplace: {cred.marketplaceId}
              </div>
            )}
          </div>
          {isConnected && (
            <form method="POST" action="/api/amazon/disconnect" className="ml-auto">
              <button type="submit" className="btn-danger text-xs py-1.5">Disconnect</button>
            </form>
          )}
        </div>
      </div>

      {/* Connect form */}
      {!isConnected && (
        <div className="card p-6">
          <h2 className="font-semibold mb-1" style={{ color: '#fafafa' }}>Connect Amazon Seller Account</h2>
          <p className="text-sm mb-5" style={{ color: '#71717a' }}>
            Enter your SP-API credentials. Tokens are encrypted with AES-256-GCM before storage.
          </p>

          <div className="rounded-xl px-4 py-3 mb-5 flex gap-2" style={{ background: 'rgba(245,158,11,0.1)', border: '0.5px solid rgba(245,158,11,0.25)' }}>
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-400">
              You must have a registered SP-API application. See{' '}
              <a
                href="https://developer-docs.amazon.com/sp-api/docs/registering-your-application"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
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
          <h2 className="font-semibold mb-4" style={{ color: '#fafafa' }}>Available Integrations</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              ['Inventory Sync', 'Pull current FBA inventory levels', true],
              ['Listings API', 'Update listing prices and quantities', true],
              ['Orders API', 'Track sales and fulfilled orders', true],
              ['Reports API', 'Download settlement and inventory reports', false],
            ].map(([name, desc, active]) => (
              <div
                key={name as string}
                className="rounded-xl p-4"
                style={active
                  ? { border: '0.5px solid rgba(34,197,94,0.2)', background: 'rgba(34,197,94,0.06)' }
                  : { border: '0.5px solid #27272a', background: '#18181b', opacity: 0.6 }}
              >
                <div className="font-medium text-sm" style={{ color: '#fafafa' }}>{name as string}</div>
                <div className="text-xs mt-1" style={{ color: '#71717a' }}>{desc as string}</div>
                {!active && <div className="text-xs mt-2 text-amber-400">Coming soon</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
