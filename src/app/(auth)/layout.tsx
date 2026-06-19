export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#020617]">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-2">
            <svg width="44" height="44" viewBox="0 0 42 42" fill="none" aria-hidden="true">
              <defs>
                <linearGradient id="eall-auth-g" x1="8" y1="8" x2="34" y2="34" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#93c5fd" />
                  <stop offset="1" stopColor="#1d4ed8" />
                </linearGradient>
              </defs>
              <rect width="42" height="42" rx="10" fill="#070d1a" />
              <rect x="9" y="9"  width="6"  height="24" rx="2" fill="url(#eall-auth-g)" />
              <rect x="9" y="9"  width="22" height="6"  rx="2" fill="url(#eall-auth-g)" />
              <rect x="9" y="18" width="16" height="5"  rx="2" fill="url(#eall-auth-g)" />
              <rect x="9" y="27" width="22" height="6"  rx="2" fill="url(#eall-auth-g)" />
            </svg>
            <span className="flex flex-col items-start leading-none">
              <span className="text-2xl font-black tracking-tight text-slate-50">EALL</span>
              <span className="flex items-center gap-1 mt-1">
                <span className="text-[10px] font-bold tracking-[0.28em] text-blue-400 uppercase leading-none">SOURCE</span>
                <svg width="20" height="6" viewBox="0 0 20 6" fill="none" aria-hidden="true">
                  <path d="M0.5 3 Q9 6 18 3" stroke="#3b82f6" strokeWidth="1.1" strokeLinecap="round"/>
                  <path d="M16 1.2 L18.5 3 L16 4.8" stroke="#3b82f6" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
            </span>
          </div>
          <p className="text-sm text-slate-400">Amazon FBA Arbitrage Platform</p>
        </div>

        {/* Card */}
        <div className="bg-slate-900 rounded-2xl p-8 border border-slate-800">
          {children}
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          © {new Date().getFullYear()} EALLsource. All rights reserved.
        </p>
      </div>
    </div>
  );
}
