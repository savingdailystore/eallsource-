import Link from 'next/link';
import {
  LifeBuoy, Zap, Link2, Radar, TrendingUp,
  BarChart3, ShoppingCart, DollarSign, ShieldCheck,
  RefreshCw, CreditCard, ChevronRight, PackageSearch,
} from 'lucide-react';

export const metadata = { title: 'Help & Support' };

interface FAQItem {
  q: string;
  a: React.ReactNode;
}

interface FAQSection {
  icon:  React.ComponentType<{ className?: string }>;
  title: string;
  items: FAQItem[];
}

const SECTIONS: FAQSection[] = [
  {
    icon:  Zap,
    title: 'Getting Started',
    items: [
      {
        q: 'What do I need before I can use EALLsource?',
        a: (
          <>
            <p>Starter accounts can review curated leads in the Lead Feed immediately after signup — no Amazon account required to browse leads.</p>
            <p className="mt-2">To act on FBA opportunities, you should have an active Amazon Professional Seller account with FBA enabled. Pro tools — including Amazon SP-API connection, inventory sync, sales and profit tracking, and repricing — all require that connection.</p>
            <p className="mt-2">Amazon account approval, category restrictions, brand gating, and seller eligibility are controlled entirely by Amazon, not EALLsource. EALLsource cannot grant or remove Amazon selling permissions.</p>
          </>
        ),
      },
      {
        q: 'What is a lead and how is profit estimated?',
        a: (
          <>
            <p>A lead is a sourced product opportunity — a specific item available at a source retailer (such as Walmart or Target) that may be resellable on Amazon FBA at a profit.</p>
            <p className="mt-2">Profit estimates use: source cost, source tax rate, Amazon resale price (buy-box at time of validation), Amazon referral fee, and FBA fulfillment fee. EALLsource validates leads against live Amazon pricing and SP-API fee data where available.</p>
            <p className="mt-2">Estimates are snapshots taken at the time of validation. They are not guarantees of future profit. Prices, fees, and product availability change — always verify current economics before purchasing inventory.</p>
          </>
        ),
      },
      {
        q: 'Why can my ROI or profit change after a lead is delivered?',
        a: (
          <>
            <p>Several factors can shift the economics of a lead after it is delivered:</p>
            <ul className="list-disc pl-4 space-y-1 mt-2 text-slate-400 text-xs">
              <li>Amazon buy-box price can rise or fall; the seller holding the buy box can change.</li>
              <li>Amazon referral fees and FBA fees are subject to Amazon rate changes.</li>
              <li>Source price, availability, or applicable taxes may differ from the validated snapshot.</li>
              <li>A product can become gated, brand-restricted, or hazmat-flagged after validation.</li>
              <li>Amazon Retail (1P) can enter or re-enter a listing and suppress the 3P buy box.</li>
            </ul>
            <p className="mt-2">Always re-check SellerAmp, the Amazon Seller App, and the EALLsource Fee Preview tool before purchasing inventory. Do not buy based solely on the lead estimate.</p>
          </>
        ),
      },
      {
        q: 'What should I do first?',
        a: 'Follow the Getting Started checklist on your dashboard. The recommended order is: connect Amazon, add inventory, explore leads, then import sales reports. Configure repricing last — only after inventory costs and Amazon data are confirmed.',
      },
      {
        q: 'What is the difference between Starter and Pro?',
        a: 'Starter is free and includes the Lead Feed, ROI calculator, and validation (up to 3 new BASIC leads/week, delivered weekly). Pro ($50/mo) unlocks Amazon SP-API, sales & profit tracking, profit recovery, report imports, and the repricing approval queue (up to 15 new BASIC + PRO leads/week, delivered weekly).',
      },
      {
        q: 'Why do I see a Getting Started checklist?',
        a: 'The checklist guides you through the setup sequence in the right order. Each step unlocks the next. You can dismiss individual items as you complete them.',
      },
    ],
  },
  {
    icon:  PackageSearch,
    title: 'Buying Inventory',
    items: [
      {
        q: 'What should I check before buying inventory from a lead?',
        a: (
          <>
            <p>Before purchasing any inventory based on a lead, confirm all of the following:</p>
            <ul className="list-disc pl-4 space-y-1 mt-2 text-slate-400 text-xs">
              <li><strong className="text-slate-300">Exact product match</strong> — confirm UPC, title, size, count, flavor, and pack exactly match the Amazon listing. A different pack size or count is a different product.</li>
              <li><strong className="text-slate-300">Selling eligibility</strong> — confirm you are approved to sell this ASIN in Amazon Seller Central. Check gating status in SellerAmp or the Amazon Seller App.</li>
              <li><strong className="text-slate-300">Active buy box</strong> — confirm the buy box is active and not suppressed. A suppressed buy box means you cannot compete for the sale.</li>
              <li><strong className="text-slate-300">Amazon Retail presence</strong> — confirm Amazon (1P) is not holding the buy box or listed as a competing seller at a price at or below the buy box. Amazon Retail can reclaim the buy box at any time.</li>
              <li><strong className="text-slate-300">Current economics</strong> — re-run the EALLsource Fee Preview with today&apos;s source cost and current buy-box price. Confirm estimated profit and ROI still meet your thresholds.</li>
              <li><strong className="text-slate-300">For in-store clearance</strong> — keep your receipt and photograph the front label, back label/UPC, and clearance sticker before leaving the store. Evidence is required to import a clearance candidate.</li>
            </ul>
          </>
        ),
      },
    ],
  },
  {
    icon:  Link2,
    title: 'Amazon Connection',
    items: [
      {
        q: 'Who can connect Amazon?',
        a: 'Only the account owner can connect or reconnect Amazon SP-API. If you are not the owner, ask your account owner to complete the setup at Amazon SP-API.',
      },
      {
        q: 'Does EALLsource sync inventory automatically?',
        a: 'No. Inventory sync is on-demand only. Click the Sync button on the Inventory page to pull your current FBA stock levels from Amazon. Nothing syncs in the background without your action.',
      },
      {
        q: 'What should I do if Amazon connection fails?',
        a: (
          <>
            Try reconnecting via the{' '}
            <Link href="/dashboard/amazon" className="text-blue-400 hover:text-blue-300">Amazon SP-API page</Link>.
            For step-by-step setup instructions, see the{' '}
            <Link href="/dashboard/amazon/guide" className="text-blue-400 hover:text-blue-300">full SP-API setup guide</Link>.
            If the error persists, contact support with the error message shown on the page.
          </>
        ),
      },
    ],
  },
  {
    icon:  Radar,
    title: 'Scanner and Lead Feed',
    items: [
      {
        q: 'Why is my Lead Feed empty?',
        a: (
          <>
            The{' '}
            <Link href="/dashboard/leads" className="text-blue-400 hover:text-blue-300">Lead Feed</Link>{' '}
            is populated by EALLsource — leads are curated and delivered to your account on a weekly drop schedule (every Monday at 6:00 AM Arizona time). If your account is new, your first drop will arrive on the next scheduled Monday. If you believe leads should have been delivered but the feed is still empty, contact support@eallsource.com.
          </>
        ),
      },
      {
        q: 'What does "Sellable Only" mean?',
        a: 'The Sellable Only filter hides products that are brand-restricted, category-gated, hazmat, or flagged as high IP risk. Use it to see only items you can realistically list and sell.',
      },
      {
        q: 'When do new leads arrive?',
        a: 'New leads are delivered by EALLsource on a weekly schedule — every Monday at 6:00 AM Arizona time (Monday 1:00 PM UTC). Starter accounts receive up to 3 BASIC leads per week; Pro accounts receive up to 15 BASIC + PRO leads per week. Your weekly allocation resets each Monday.',
      },
    ],
  },
  {
    icon:  BarChart3,
    title: 'Inventory and Orders',
    items: [
      {
        q: 'Can I add inventory manually?',
        a: (
          <>
            Yes. On the{' '}
            <Link href="/dashboard/inventory" className="text-blue-400 hover:text-blue-300">Inventory page</Link>,
            use Add Item to enter a product manually, or Import CSV to bulk-upload. You can also sync from Amazon once your SP-API connection is active.
          </>
        ),
      },
      {
        q: 'Does creating a purchase order update inventory?',
        a: (
          <>
            No. Creating a{' '}
            <Link href="/dashboard/orders" className="text-blue-400 hover:text-blue-300">purchase order</Link>{' '}
            records the order but does not add inventory. Inventory increases only when you mark items as received on the order detail page.
          </>
        ),
      },
      {
        q: 'When does inventory increase?',
        a: 'Inventory quantities increase only when you receive items through the order receive workflow. Do not receive old or closed purchase orders unless you are intentionally tracking real stock movement.',
      },
    ],
  },
  {
    icon:  DollarSign,
    title: 'Sales & Profit',
    items: [
      {
        q: 'Why is profit showing as incomplete?',
        a: (
          <>
            Profit is incomplete when Amazon fee data is missing. The{' '}
            <Link href="/dashboard/sales" className="text-blue-400 hover:text-blue-300">Sales & Profit page</Link>{' '}
            shows gross profit (revenue minus cost) until you import a settlement report. Import the settlement report to add exact fees and unlock realized profit.
          </>
        ),
      },
      {
        q: 'Which report should I import first?',
        a: 'Import the Orders report (Amazon Fulfilled Shipments flat file) first to bring in revenue and order data. Then import the Settlement report to add final Amazon fees. Profit is not finalized until both reports are imported.',
      },
      {
        q: 'Are missing fees treated as zero?',
        a: 'No. Missing fees are never treated as zero. If fee data is absent, profit is marked incomplete — not calculated as if fees were free. This ensures you never see inflated profit figures.',
      },
    ],
  },
  {
    icon:  ShieldCheck,
    title: 'Profit Recovery',
    items: [
      {
        q: 'Do reimbursements change my realized profit?',
        a: (
          <>
            No. Reimbursements imported on the{' '}
            <Link href="/dashboard/recovery" className="text-blue-400 hover:text-blue-300">Profit Recovery page</Link>{' '}
            are tracked separately and do not affect Sales & Profit realized profit numbers. They represent potential Amazon reimbursements to investigate, not confirmed profit.
          </>
        ),
      },
      {
        q: 'What does "possible underpayment" mean?',
        a: 'Possible underpayment is an estimate based on comparing your inventory records against Amazon reimbursement data. It flags cases where Amazon may owe you money. Review each flag carefully before filing a dispute — these are estimates, not guarantees.',
      },
    ],
  },
  {
    icon:  RefreshCw,
    title: 'Repricing',
    items: [
      {
        q: 'Is repricing automatic?',
        a: (
          <>
            No. The{' '}
            <Link href="/dashboard/repricing" className="text-blue-400 hover:text-blue-300">repricing engine</Link>{' '}
            generates price recommendations but does not push them automatically. Every proposed price change appears in an approval queue — you must review and approve each one before anything is sent to Amazon.
          </>
        ),
      },
      {
        q: 'Can EALLsource push prices without my approval?',
        a: 'No. Price pushes require explicit approval in the repricing panel. Nothing is sent to Amazon until you approve a proposal. Dismissing a proposal discards it permanently.',
      },
      {
        q: 'When should I configure repricing?',
        a: 'Configure repricing last — after your inventory is set up, unit costs are confirmed, SKUs match your Amazon listings, and your Amazon SP-API connection is active. Setting up repricing before costs are correct risks generating inaccurate price floors.',
      },
    ],
  },
  {
    icon:  CreditCard,
    title: 'Account, Billing, and Security',
    items: [
      {
        q: 'How do I upgrade to Pro?',
        a: (
          <>
            Go to the{' '}
            <Link href="/dashboard/billing" className="text-blue-400 hover:text-blue-300">Billing page</Link>{' '}
            to see plan options and upgrade. If the self-serve upgrade is not yet available, use the contact link on the billing page and we will set it up manually.
          </>
        ),
      },
      {
        q: 'How do I change my password or enable MFA?',
        a: (
          <>
            Go to{' '}
            <Link href="/dashboard/settings" className="text-blue-400 hover:text-blue-300">Settings</Link>.
            You can change your password and enable two-factor authentication (TOTP) from there. MFA is highly recommended for accounts with Amazon SP-API connected.
          </>
        ),
      },
      {
        q: 'Where do I get support?',
        a: (
          <>
            Email us at{' '}
            <a href="mailto:support@eallsource.com" className="text-blue-400 hover:text-blue-300">
              support@eallsource.com
            </a>
            {' '}or use the{' '}
            <Link href="/contact" className="text-blue-400 hover:text-blue-300">Contact page</Link>.
            Include your account email, the page you were on, what you were trying to do, and any error message you saw.
          </>
        ),
      },
    ],
  },
];

const QUICK_LINKS = [
  { label: 'Amazon SP-API',   href: '/dashboard/amazon',   icon: Link2       },
  { label: 'Lead Feed',       href: '/dashboard/leads',    icon: TrendingUp  },
  { label: 'Inventory',       href: '/dashboard/inventory',icon: BarChart3   },
  { label: 'Orders',          href: '/dashboard/orders',   icon: ShoppingCart},
  { label: 'Sales & Profit',  href: '/dashboard/sales',    icon: DollarSign  },
  { label: 'Profit Recovery', href: '/dashboard/recovery', icon: ShieldCheck },
  { label: 'Repricing',       href: '/dashboard/repricing',icon: RefreshCw   },
  { label: 'Billing',         href: '/dashboard/billing',  icon: CreditCard  },
];

export default function HelpPage() {
  return (
    <div className="p-6 lg:p-8 max-w-4xl space-y-8">

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Help & Support</h1>
          <p className="page-subtitle">
            Answers to common setup, import, inventory, and repricing questions.
          </p>
        </div>
      </div>

      {/* Support card */}
      <div className="card p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
          <LifeBuoy className="w-5 h-5 text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-50 text-sm">Can't find your answer?</div>
          <div className="text-xs text-slate-400 mt-0.5">
            Email us at{' '}
            <a href="mailto:support@eallsource.com" className="text-blue-400 hover:text-blue-300 transition-colors">
              support@eallsource.com
            </a>
            {' '}— include your account email, the page you were on, what you were trying to do, and any error message.
          </div>
        </div>
        <Link
          href="/contact"
          className="btn-secondary text-sm flex-shrink-0 flex items-center gap-1.5"
        >
          Contact Support
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Quick links */}
      <div>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Quick Links</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {QUICK_LINKS.map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-sm text-slate-300 hover:text-white transition-all"
            >
              <Icon className="w-4 h-4 text-slate-500 flex-shrink-0" />
              <span className="truncate">{label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* FAQ sections */}
      <div className="space-y-6">
        {SECTIONS.map((section) => (
          <div key={section.title} className="card overflow-hidden">
            {/* Section header */}
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-800 bg-slate-800/30">
              <section.icon className="w-4 h-4 text-blue-400 flex-shrink-0" />
              <h2 className="text-sm font-semibold text-slate-200">{section.title}</h2>
            </div>

            {/* FAQ items */}
            <div className="divide-y divide-slate-800/60">
              {section.items.map((item, i) => (
                <div key={i} className="px-5 py-4">
                  <div className="text-sm font-medium text-slate-100 mb-1.5">{item.q}</div>
                  <div className="text-sm text-slate-400 leading-relaxed">{item.a}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom contact nudge */}
      <div className="text-center py-4">
        <p className="text-sm text-slate-500">
          Still need help?{' '}
          <a href="mailto:support@eallsource.com" className="text-blue-400 hover:text-blue-300 transition-colors">
            support@eallsource.com
          </a>
        </p>
      </div>

    </div>
  );
}
