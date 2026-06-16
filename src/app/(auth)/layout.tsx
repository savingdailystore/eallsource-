export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-100">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-2">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <rect x="2"  y="18" width="7" height="12" rx="2" fill="#3b82f6" fillOpacity="0.4" />
              <rect x="12" y="10" width="7" height="20" rx="2" fill="#3b82f6" fillOpacity="0.7" />
              <rect x="22" y="2"  width="7" height="28" rx="2" fill="#3b82f6" />
            </svg>
            <span className="text-xl font-semibold text-slate-900">
              Arbitrage Pro <span className="text-blue-500">AI</span>
            </span>
          </div>
          <p className="text-sm text-slate-500">Amazon FBA Arbitrage Platform</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl p-8 border border-slate-200">
          {children}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          © {new Date().getFullYear()} Arbitrage Pro AI. All rights reserved.
        </p>
      </div>
    </div>
  );
}
