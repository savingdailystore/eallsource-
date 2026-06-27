import Link from 'next/link';

export const SUPPORT_EMAIL = 'support@eallsource.com';

function Logo() {
  return (
    <Link href="/" className="inline-flex items-center gap-3">
      <svg width="38" height="38" viewBox="0 0 42 42" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="eall-mkt-g" x1="8" y1="8" x2="34" y2="34" gradientUnits="userSpaceOnUse">
            <stop stopColor="#93c5fd" />
            <stop offset="1" stopColor="#1d4ed8" />
          </linearGradient>
        </defs>
        <rect width="42" height="42" rx="10" fill="#070d1a" />
        <rect x="9" y="9"  width="6"  height="24" rx="2" fill="url(#eall-mkt-g)" />
        <rect x="9" y="9"  width="22" height="6"  rx="2" fill="url(#eall-mkt-g)" />
        <rect x="9" y="18" width="16" height="5"  rx="2" fill="url(#eall-mkt-g)" />
        <rect x="9" y="27" width="22" height="6"  rx="2" fill="url(#eall-mkt-g)" />
      </svg>
      <span className="flex flex-col items-start leading-none">
        <span className="text-xl font-black tracking-tight text-slate-50">EALL</span>
        <span className="flex items-center gap-1 mt-0.5">
          <span className="text-[9px] font-bold tracking-[0.28em] text-blue-400 uppercase leading-none">SOURCE</span>
          <svg width="18" height="6" viewBox="0 0 20 6" fill="none" aria-hidden="true">
            <path d="M0.5 3 Q9 6 18 3" stroke="#3b82f6" strokeWidth="1.1" strokeLinecap="round" />
            <path d="M16 1.2 L18.5 3 L16 4.8" stroke="#3b82f6" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </span>
    </Link>
  );
}

export default function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-[#020617]">
      <header className="border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Logo />
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/#features" className="text-slate-400 hover:text-slate-200 transition-colors hidden sm:inline">Features</Link>
            <Link href="/contact" className="text-slate-400 hover:text-slate-200 transition-colors">Contact</Link>
            <Link href="/login" className="text-slate-300 hover:text-white transition-colors">Sign in</Link>
            <Link href="/register" className="btn-primary py-2">Start free trial</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-slate-800 mt-16">
        <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
          <p className="text-slate-500">© {new Date().getFullYear()} EALLsource. All rights reserved.</p>
          <nav className="flex items-center gap-5">
            <Link href="/privacy" className="text-slate-400 hover:text-slate-200 transition-colors">Privacy Policy</Link>
            <Link href="/terms"   className="text-slate-400 hover:text-slate-200 transition-colors">Terms of Service</Link>
            <Link href="/contact" className="text-slate-400 hover:text-slate-200 transition-colors">Contact</Link>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-slate-400 hover:text-slate-200 transition-colors">{SUPPORT_EMAIL}</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

/** Shared wrapper for the long-form legal pages (Privacy, Terms). */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <MarketingShell>
      <article className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-slate-50">{title}</h1>
        <p className="text-sm text-slate-500 mt-2">Last updated: {updated}</p>
        <div className="mt-8 space-y-6 text-sm leading-relaxed text-slate-300 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-100 [&_h2]:mt-8 [&_h2]:mb-2 [&_a]:text-blue-400 [&_a:hover]:underline [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 [&_strong]:text-slate-100">
          {children}
        </div>
      </article>
    </MarketingShell>
  );
}
