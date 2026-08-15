import Link from 'next/link';
import { CheckCircle2, XCircle, ExternalLink, AlertTriangle, ShoppingBag } from 'lucide-react';

export const metadata = { title: 'SP-API Setup Guide' };

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-bold text-blue-400">{n}</span>
        </div>
        <div className="w-px flex-1 bg-slate-800 mt-2" />
      </div>
      <div className="pb-8 flex-1 min-w-0">
        <h3 className="font-semibold text-slate-100 mb-3">{title}</h3>
        <div className="space-y-2 text-sm text-slate-300 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function Good({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2.5 my-2">
      <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
      <p className="text-xs text-green-300 leading-relaxed">{children}</p>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2.5 my-2">
      <AlertTriangle className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
      <p className="text-xs text-slate-300 leading-relaxed">{children}</p>
    </div>
  );
}

export default function SpApiGuidePage() {
  return (
    <div className="p-6 lg:p-8 max-w-2xl">
      <div className="mb-8">
        <Link href="/dashboard/amazon" className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 mb-4">
          ← Back to Amazon SP-API
        </Link>
        <h1 className="page-title">How to connect your Amazon account</h1>
        <p className="page-subtitle mt-1">
          Authorize EALLsource to access your Seller Central account in a few steps.
          No developer account or manual token required.
        </p>
      </div>

      {/* Overview */}
      <div className="card p-5 mb-8">
        <p className="text-sm text-slate-300 leading-relaxed">
          EALLsource connects to Amazon through Amazon&apos;s official OAuth (Login with Amazon) flow.
          You authorize us on Amazon&apos;s own consent page — EALLsource never sees your Seller Central
          password and only receives the permissions you approve.
        </p>
        <Good>
          You do not need to register as an Amazon developer or create your own SP-API application.
          Just use the Connect button below.
        </Good>
      </div>

      {/* Steps */}
      <div>

        <Step n="1" title="Open the Amazon SP-API page">
          <p>
            In your EALLsource dashboard, go to{' '}
            <Link href="/dashboard/amazon" className="text-blue-400 hover:underline">Amazon SP-API</Link>.
            Click the <strong className="text-slate-100">Connect with Amazon</strong> button.
          </p>
          <Note>
            Only account owners and admins can connect or reconnect Amazon. If you are a team member, ask your account owner or admin to complete this step.
          </Note>
        </Step>

        <Step n="2" title="Review the Amazon consent screen">
          <p>
            You will be redirected to <strong className="text-slate-100">sellercentral.amazon.com</strong>.
            Amazon will show you the permissions EALLsource is requesting for your seller account:
          </p>
          <ul className="list-disc pl-4 space-y-1 my-2 text-slate-400 text-xs">
            <li>View your FBA inventory levels</li>
            <li>View and update your product listings and prices</li>
            <li>Access your settlement and reimbursement financial reports</li>
          </ul>
          <p>Review the permissions and click <strong className="text-slate-100">Confirm</strong> to authorize EALLsource.</p>
          <Note>
            Make sure you are signed into the correct Amazon seller account before approving. If you have multiple accounts, sign out and sign back in to the right one first.
          </Note>
        </Step>

        <Step n="3" title="Return to EALLsource">
          <p>
            Amazon redirects you back to EALLsource automatically. The Amazon SP-API page will show a
            green <strong className="text-slate-100">Connected</strong> status badge with your Seller ID
            and marketplace.
          </p>
          <Good>Connection complete — no further setup required.</Good>
        </Step>

        <Step n="4" title="Use your connected account">
          <p>Once connected, the following integrations become available:</p>
          <div className="grid grid-cols-1 gap-2 my-3">
            {[
              ['Inventory Sync', 'Pull current FBA stock levels from Seller Central on demand.'],
              ['Repricing', 'Propose and push competitive prices through a safe approval queue.'],
              ['Report imports', 'Download settlement and reimbursement reports to track profit and recovery.'],
            ].map(([name, desc]) => (
              <div key={name} className="bg-slate-800 rounded-lg px-3 py-2.5 flex gap-3 items-start">
                <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-slate-100">{name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Step>

        {/* Final step — done */}
        <div className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-4 h-4 text-green-400" />
            </div>
          </div>
          <div className="pb-4 flex-1">
            <h3 className="font-semibold text-slate-100 mb-3">Ready to connect?</h3>
            <Link
              href="/dashboard/amazon"
              className="btn-primary inline-flex items-center gap-2"
            >
              <ShoppingBag className="w-4 h-4" />
              Go to Amazon SP-API →
            </Link>
          </div>
        </div>
      </div>

      {/* Disconnect / revoke */}
      <div className="card p-5 mt-6 border-slate-700">
        <div className="flex gap-2 mb-2">
          <XCircle className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
          <h2 className="text-sm font-semibold text-slate-200">How to disconnect or revoke access</h2>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          You can disconnect your Amazon account at any time from the{' '}
          <Link href="/dashboard/amazon" className="text-blue-400 hover:underline">Amazon SP-API page</Link>{' '}
          in EALLsource — click <strong className="text-slate-300">Disconnect</strong>. This immediately
          deactivates your stored credentials in EALLsource.
        </p>
        <p className="text-xs text-slate-400 leading-relaxed mt-2">
          To fully revoke access from Amazon&apos;s side, visit{' '}
          <a
            href="https://sellercentral.amazon.com/apps/manage"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline inline-flex items-center gap-1"
          >
            Seller Central → Apps &amp; Services → Manage Your Apps
            <ExternalLink className="w-3 h-3" />
          </a>{' '}
          and remove EALLsource from your authorized applications.
        </p>
      </div>

      {/* Support */}
      <div className="card p-5 mt-4 border-slate-700">
        <p className="text-xs text-slate-400 leading-relaxed">
          <strong className="text-slate-300">Need help?</strong> If the connection fails or you see an
          error after authorizing, contact us at{' '}
          <a href="mailto:support@eallsource.com" className="text-blue-400 hover:underline">
            support@eallsource.com
          </a>{' '}
          with a description of the error and we will help you resolve it.
        </p>
      </div>
    </div>
  );
}
