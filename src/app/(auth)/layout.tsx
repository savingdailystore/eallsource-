export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-9 h-9 rounded-xl bg-green-600 flex items-center justify-center">
              <span className="text-white font-black text-lg">E</span>
            </div>
            <span className="text-2xl font-bold text-white">EALLsource</span>
          </div>
          <p className="text-slate-400 text-sm">Amazon FBA Arbitrage Platform</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {children}
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          © {new Date().getFullYear()} EALLsource. All rights reserved.
        </p>
      </div>
    </div>
  );
}
