export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: '#09090b' }}
    >
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-2">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <rect x="2"  y="18" width="7" height="12" rx="2" fill="#a78bfa" fillOpacity="0.45" />
              <rect x="12" y="10" width="7" height="20" rx="2" fill="#a78bfa" fillOpacity="0.7" />
              <rect x="22" y="2"  width="7" height="28" rx="2" fill="#a78bfa" />
            </svg>
            <span className="text-xl font-semibold text-white">
              Arbitrage Pro <span style={{ color: '#a78bfa' }}>AI</span>
            </span>
          </div>
          <p className="text-sm" style={{ color: '#71717a' }}>Amazon FBA Arbitrage Platform</p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-8"
          style={{ background: '#18181b', border: '0.5px solid #27272a' }}
        >
          {children}
        </div>

        <p className="text-center text-xs mt-6" style={{ color: '#3f3f46' }}>
          © {new Date().getFullYear()} Arbitrage Pro AI. All rights reserved.
        </p>
      </div>
    </div>
  );
}
