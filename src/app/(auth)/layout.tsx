export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#0a0a0a]">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-2">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <rect x="2"  y="18" width="7" height="12" rx="2" fill="#f97316" fillOpacity="0.45" />
              <rect x="12" y="10" width="7" height="20" rx="2" fill="#f97316" fillOpacity="0.75" />
              <rect x="22" y="2"  width="7" height="28" rx="2" fill="#f97316" />
            </svg>
            <span className="text-xl font-semibold text-zinc-50">
              Arbitrage Pro <span className="text-orange-500">AI</span>
            </span>
          </div>
          <p className="text-sm text-zinc-400">Amazon FBA Arbitrage Platform</p>
        </div>

        {/* Card */}
        <div className="bg-zinc-900 rounded-2xl p-8 border border-zinc-800">
          {children}
        </div>

        <p className="text-center text-xs text-zinc-500 mt-6">
          © {new Date().getFullYear()} Arbitrage Pro AI. All rights reserved.
        </p>
      </div>
    </div>
  );
}
