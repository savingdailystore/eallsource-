'use client';

import { useState, useEffect } from 'react';
import { BookOpen, ChevronDown, ChevronUp, DollarSign, Target, Play, ListChecks, UploadCloud, ShieldCheck } from 'lucide-react';

const STORAGE_KEY = 'repricing-guide-collapsed';

const STEPS = [
  {
    icon:  DollarSign,
    title: '1. Set what you paid',
    body:  'Each item you stock becomes a rule. Click the sliders icon on a rule and enter your Unit Cost (what you paid per unit). Without a cost or a manual floor, the rule is skipped — we won’t price something we can’t prove is profitable.',
  },
  {
    icon:  Target,
    title: '2. Pick a strategy',
    body:  'Competitive chases the Buy Box but never drops below your floor. Floor always sits at your lowest safe price. Ceiling prices near the top for max margin. Your floor is the higher of your manual floor and your Min ROI floor.',
  },
  {
    icon:  Play,
    title: '3. Run All Now',
    body:  'This pulls live Amazon prices for each rule and calculates a recommended price. It does NOT change anything yet. The message up top tells you how many changes are ready and why any were skipped.',
  },
  {
    icon:  ListChecks,
    title: '4. Review proposals',
    body:  'Ready changes appear in the "Pending Price Changes" panel showing current → new price. Nothing is live yet — this is your chance to check each one.',
  },
  {
    icon:  UploadCloud,
    title: '5. Push to Amazon',
    body:  'Click Push on a row (or "Push all") and confirm. Only then is the new price sent to your live Amazon listing. A green "Pushed live" badge appears in Recent Reprice Activity.',
  },
  {
    icon:  ShieldCheck,
    title: '6. Verify in Seller Central',
    body:  '"Pushed live" means Amazon accepted the change — it propagates within a few minutes. Check Seller Central to confirm the new price shows up.',
  },
];

export function RepricingGuide() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === '1');
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
  }

  return (
    <div className="card overflow-hidden border-blue-500/20">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-800/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-blue-400" />
          <h2 className="font-semibold text-slate-50">How repricing works</h2>
          <span className="text-xs text-slate-500">— a quick 6-step guide</span>
        </div>
        {collapsed ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronUp className="w-4 h-4 text-slate-500" />}
      </button>

      {!collapsed && (
        <div className="px-5 pb-5">
          <p className="text-sm text-slate-400 mb-4">
            Repricing recommends a price for each item and lets you push it to Amazon — but
            <span className="text-slate-200 font-medium"> nothing goes live until you click Push</span>, and
            <span className="text-slate-200 font-medium"> a price never drops below your floor</span>.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {STEPS.map((s) => (
              <div key={s.title} className="bg-slate-800/40 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <s.icon className="w-4 h-4 text-blue-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-100">{s.title}</h3>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-4">
            Stuck on “Last Run: Never”? The rule was skipped — set a Unit Cost (or a Floor), then Run All Now. The message at the top always explains why a rule didn’t produce a change.
          </p>
        </div>
      )}
    </div>
  );
}
