import Link from 'next/link';
import {
  TrendingUp,
  ShieldCheck,
  Zap,
  BarChart3,
  RefreshCw,
  Download,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';

const FEATURES = [
  {
    icon: TrendingUp,
    title: 'ROI-First Filtering',
    desc: 'Only see products with 30%+ ROI after all fees, taxes, and prep costs.',
  },
  {
    icon: ShieldCheck,
    title: 'IP Risk Engine',
    desc: 'Automatic brand restriction detection. Nike, Disney, Apple, and 50+ flagged brands filtered out.',
  },
  {
    icon: Zap,
    title: 'Live Cashback Aggregation',
    desc: 'Rakuten, BeFrugal, TopCashback, CardBear, and Capital One Shopping stacked automatically.',
  },
  {
    icon: BarChart3,
    title: 'BSR & Competition Analysis',
    desc: 'Top-3% BSR threshold enforced. Max 15 FBA / 30 total sellers per product.',
  },
  {
    icon: RefreshCw,
    title: 'Weekly AI Product Feed',
    desc: '40 fresh, vetted opportunities delivered every week. No duplicate ASINs from the past 90 days.',
  },
  {
    icon: Download,
    title: 'CSV & Excel Export',
    desc: 'Export any product list or saved opportunities to CSV or formatted Excel with one click.',
  },
];

const STATS = [
  { value: '30%+', label: 'Minimum ROI Required' },
  { value: 'Top 3%', label: 'BSR Threshold' },
  { value: '50+', label: 'Restricted Brands Filtered' },
  { value: '40/wk', label: 'Fresh Leads Weekly' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b bg-white/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg text-gray-900">EALLsource</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
              Sign in
            </Link>
            <Link
              href="/register"
              className="text-sm bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors font-medium"
            >
              Get Started Free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 bg-green-50 text-green-700 text-sm font-medium px-3 py-1.5 rounded-full mb-6 border border-green-200">
          <Zap className="w-3.5 h-3.5" />
          40 vetted products delivered every week
        </div>
        <h1 className="text-5xl sm:text-6xl font-bold text-gray-900 leading-tight mb-6">
          Find Profitable Amazon
          <br />
          <span className="text-green-600">Arbitrage Opportunities</span>
          <br />
          Automatically
        </h1>
        <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-10">
          EALLsource scans top retailers, stacks cashback, calculates real ROI after all fees,
          and delivers only products that pass strict BSR, IP, and competition filters.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/register"
            className="flex items-center gap-2 bg-green-600 text-white px-8 py-3.5 rounded-xl hover:bg-green-700 transition-colors font-semibold text-base shadow-lg shadow-green-200"
          >
            Start Sourcing Free <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/login"
            className="flex items-center gap-2 border border-gray-200 text-gray-700 px-8 py-3.5 rounded-xl hover:bg-gray-50 transition-colors font-semibold text-base"
          >
            View Demo Dashboard
          </Link>
        </div>
      </section>

      {/* Stats bar */}
      <section className="bg-green-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid grid-cols-2 sm:grid-cols-4 gap-8">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-3xl font-bold text-white mb-1">{s.value}</div>
              <div className="text-green-100 text-sm">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Everything you need to source profitably
          </h2>
          <p className="text-gray-500 max-w-xl mx-auto">
            Built specifically for Amazon Online Arbitrage sellers who need quality leads, not just data.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="p-6 border border-gray-100 rounded-2xl hover:border-green-200 hover:shadow-md transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center mb-4 group-hover:bg-green-100 transition-colors">
                <f.icon className="w-5 h-5 text-green-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">{f.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Product columns preview */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">
              Every data point you need
            </h2>
            <p className="text-gray-500">27 columns of verified product data, updated continuously.</p>
          </div>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {[
              'ASIN & UPC', 'Source URL & Retailer', 'Final Cost After Discounts',
              'Cashback Sources (6+)', 'Buy Box Price', 'Lowest Listed Price',
              'Amazon Fees', 'Prep + Tax (30%)', 'Net Profit', 'ROI %',
              'BSR & BSR %', 'FBA Seller Count', 'Total Seller Count',
              'Auto-Ungated Status', 'Buy Box Owner', 'Amazon Is Seller',
              'IP Risk Score', 'Keepa History Link', 'Category',
              'Save For Later', 'Purchase Tracking', 'Notes & Tags',
              'CSV / Excel Export', 'Weekly Feed Archive', 'Admin Dashboard',
              'User Roles', 'Subscription Plans',
            ].map((col) => (
              <div
                key={col}
                className="flex items-center gap-2 bg-white px-3 py-2.5 rounded-lg border border-gray-100 text-sm text-gray-700"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                {col}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
        <h2 className="text-4xl font-bold text-gray-900 mb-4">
          Ready to find your next profitable flip?
        </h2>
        <p className="text-gray-500 mb-8 text-lg">
          Start free. Upgrade when you need more leads.
        </p>
        <Link
          href="/register"
          className="inline-flex items-center gap-2 bg-green-600 text-white px-10 py-4 rounded-xl hover:bg-green-700 transition-colors font-semibold text-lg shadow-xl shadow-green-200"
        >
          Get started — it&apos;s free <ArrowRight className="w-5 h-5" />
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-gray-600">
            <div className="w-6 h-6 rounded bg-green-600 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold">EALLsource</span>
          </div>
          <p className="text-gray-400 text-sm">
            © {new Date().getFullYear()} EALLsource. Not affiliated with Amazon.
          </p>
        </div>
      </footer>
    </div>
  );
}
