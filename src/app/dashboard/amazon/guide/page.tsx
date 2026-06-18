import { CheckCircle2, Clock, ExternalLink, AlertTriangle, ChevronRight } from 'lucide-react';

export const metadata = { title: 'SP-API Setup Guide' };

function Step({ n, title, time, children }: {
  n: string; title: string; time?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-bold text-blue-400">{n}</span>
        </div>
        <div className="w-px flex-1 bg-slate-800 mt-2" />
      </div>
      <div className="pb-8 flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-3">
          <h3 className="font-semibold text-slate-100">{title}</h3>
          {time && (
            <span className="flex items-center gap-1 text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">
              <Clock className="w-3 h-3" /> {time}
            </span>
          )}
        </div>
        <div className="space-y-2 text-sm text-slate-300 leading-relaxed">
          {children}
        </div>
      </div>
    </div>
  );
}

function NavPath({ steps }: { steps: string[] }) {
  return (
    <div className="flex items-center flex-wrap gap-1 text-xs bg-slate-800 rounded-lg px-3 py-2 my-2 font-medium">
      {steps.map((s, i) => (
        <span key={i} className="flex items-center gap-1">
          <span className="text-slate-200">{s}</span>
          {i < steps.length - 1 && <ChevronRight className="w-3 h-3 text-slate-600" />}
        </span>
      ))}
    </div>
  );
}

function Answer({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-800 rounded-lg px-3 py-2.5 my-1.5">
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <p className="text-slate-100 font-medium text-sm">{value}</p>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5 my-2">
      <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
      <p className="text-xs text-amber-300 leading-relaxed">{children}</p>
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

export default function SpApiGuidePage() {
  return (
    <div className="p-6 lg:p-8 max-w-2xl">
      <div className="mb-8">
        <a href="/dashboard/amazon" className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 mb-4">
          ← Back to Amazon SP-API
        </a>
        <h1 className="page-title">SP-API Setup Guide</h1>
        <p className="page-subtitle mt-1">
          How to get your Amazon SP-API developer access approved — step by step.
        </p>
        <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> ~30 min to complete</span>
          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> 1–5 days for Amazon approval</span>
        </div>
      </div>

      {/* Overview */}
      <div className="card p-5 mb-8">
        <p className="text-sm text-slate-300 leading-relaxed">
          To connect your Amazon seller account to EALLsource, Amazon requires you to register as
          an SP-API developer and get your developer profile approved. This is a one-time process.
          Follow the steps below exactly and your application will be approved.
        </p>
        <Tip>
          Amazon may reject your first submission if the security questionnaire answers are too vague.
          The exact answers in this guide are based on what Amazon approved — use them word for word.
        </Tip>
      </div>

      {/* Steps */}
      <div>

        {/* Step 1 */}
        <Step n="1" title="Make sure you have a Professional seller account" time="Check now">
          <p>SP-API access requires an Amazon <strong className="text-slate-100">Professional selling plan</strong> (not Individual). Individual plan sellers cannot register as developers.</p>
          <NavPath steps={['Seller Central', 'Settings', 'Account Info', 'Your Services']} />
          <p>Confirm it says <strong className="text-slate-100">Professional</strong> next to Selling on Amazon.</p>
        </Step>

        {/* Step 2 */}
        <Step n="2" title="Open the Developer Console" time="2 min">
          <p>Log into Seller Central, then navigate to:</p>
          <NavPath steps={['Apps & Services', 'Develop Apps']} />
          <p>Click <strong className="text-slate-100">Developer Profile</strong> at the top of the page. If you have never registered, you will see a form to fill in your developer information.</p>
        </Step>

        {/* Step 3 */}
        <Step n="3" title="Fill in your developer profile" time="10 min">
          <p>Complete each section using these exact answers:</p>

          <div className="mt-3 space-y-4">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-2 font-medium">Developer info</p>
              <Answer label="Developer name" value="Your full name or business name" />
              <Answer label="Developer email" value="Your email address" />
              <Answer label="Developer website" value="https://eallsource.com" />
            </div>

            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-2 font-medium">About your app</p>
              <Answer label="App purpose" value="I am building a private application to manage my own Amazon seller account. I will use SP-API to sync FBA inventory, monitor pricing, and track orders for my own selling operations only." />
              <Answer label="Will you access other sellers' data?" value="No — this application is for my own seller account only." />
            </div>

            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-2 font-medium">Data usage</p>
              <Answer label="What data will you access?" value="FBA inventory levels, product listings, and pricing data for my own seller account." />
              <Answer label="Where is data stored?" value="Encrypted in a cloud-hosted PostgreSQL database. All tokens are encrypted with AES-256-GCM before storage." />
              <Answer label="Who has access to the data?" value="Only me, the account owner." />
            </div>

            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-2 font-medium">Security questions</p>
              <Answer label="Password policy" value="Passwords must be at least 12 characters and include uppercase, lowercase, numbers, and special characters." />
              <Answer label="Do you use MFA?" value="Yes. Multi-factor authentication (TOTP) is enforced for all user accounts." />
              <Answer label="Data encryption" value="All sensitive data is encrypted at rest using AES-256-GCM. Data is transmitted over TLS 1.2+." />
              <Answer label="Incident response" value="I have a documented incident response plan. Security incidents are reviewed within 24 hours and Amazon is notified at security@amazon.com within 24 hours of confirmed data breaches." />
            </div>
          </div>

          <Tip>
            For "Restricted Data Token" / PII delegation — always select <strong>No</strong>. You do not need to handle other sellers' personal information.
          </Tip>
        </Step>

        {/* Step 4 */}
        <Step n="4" title="Select your API roles" time="1 min">
          <p>When asked which roles your app needs, check <strong className="text-slate-100">all four</strong> of these:</p>
          <div className="grid grid-cols-2 gap-2 my-3">
            {['Pricing', 'Inventory and Order Tracking', 'Amazon Fulfillment', 'Product Listing'].map((r) => (
              <div key={r} className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                {r}
              </div>
            ))}
          </div>
          <Tip>
            The FBA Inventory sync requires <strong>Amazon Fulfillment</strong> or <strong>Product Listing</strong> — without these you will get a 403 error even with a valid token.
          </Tip>
        </Step>

        {/* Step 5 */}
        <Step n="5" title="Submit and wait for approval" time="1–5 days">
          <p>Click <strong className="text-slate-100">Submit</strong>. Amazon will review your application and email you when it is approved or if they need more information.</p>
          <Good>
            If you followed the security answers above exactly, approval is typically granted within 1–3 business days. If rejected, Amazon's email will say which section to fix — update that section and resubmit.
          </Good>
          <Tip>
            Do not create a new application if rejected — edit the existing one and resubmit.
          </Tip>
        </Step>

        {/* Step 6 */}
        <Step n="6" title="Create your app and get your authorization code" time="5 min">
          <p>Once approved, go back to:</p>
          <NavPath steps={['Apps & Services', 'Develop Apps', 'Add new app client']} />
          <div className="space-y-1.5 my-2">
            <Answer label="App name" value="Any name you like, e.g. My Inventory App" />
            <Answer label="API Type" value="SP API" />
            <Answer label="Roles" value="Check all four roles (same as Step 4)" />
          </div>
          <p>Click <strong className="text-slate-100">Save and exit</strong>.</p>
          <p className="mt-2">Then on the Develop Apps page, click the <strong className="text-slate-100">▾ dropdown</strong> next to your new app → click <strong className="text-slate-100">Authorize</strong>. Amazon generates your authorization code — a long string starting with <code className="text-blue-300 bg-slate-800 px-1 rounded text-xs">Atzr|</code>. Copy the whole thing.</p>
          <Good>You now have everything you need. Head back to connect your account.</Good>
        </Step>

        {/* Step 7 */}
        <div className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-4 h-4 text-green-400" />
            </div>
          </div>
          <div className="pb-4 flex-1">
            <h3 className="font-semibold text-slate-100 mb-3">Connect your account to EALLsource</h3>
            <p className="text-sm text-slate-300 mb-4">
              You now have your Seller ID and authorization code. Go back to the Amazon SP-API page, open <strong className="text-slate-100">Manual setup</strong>, and fill in the form.
            </p>
            <a
              href="/dashboard/amazon"
              className="btn-primary inline-flex items-center gap-2"
            >
              <Link2Icon />
              Go connect my account →
            </a>
          </div>
        </div>

      </div>

      {/* Support note */}
      <div className="card p-5 mt-4 border-slate-700">
        <p className="text-xs text-slate-400 leading-relaxed">
          <strong className="text-slate-300">Need help?</strong> If Amazon rejects your application or you run into an error during this process, contact us at{' '}
          <a href="mailto:support@eallsource.com" className="text-blue-400 hover:underline">support@eallsource.com</a>{' '}
          with a screenshot of the rejection email and we will help you resolve it.
        </p>
      </div>
    </div>
  );
}

function Link2Icon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}
