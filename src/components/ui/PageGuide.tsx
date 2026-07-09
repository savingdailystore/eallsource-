'use client';

import { useState, useEffect } from 'react';
import { BookOpen, ChevronDown, ChevronUp } from 'lucide-react';

export interface GuideStep {
  icon?:  React.ComponentType<{ className?: string }>;
  title:  string;
  body:   string;
}

interface PageGuideProps {
  storageKey:   string;
  title:        string;
  subtitle?:    string;
  steps:        GuideStep[];
  columns?:     2 | 3 | 4;
  defaultOpen?: boolean;
}

const COLS: Record<number, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
};

export function PageGuide({
  storageKey,
  title,
  subtitle,
  steps,
  columns    = 3,
  defaultOpen = false,
}: PageGuideProps) {
  const [collapsed, setCollapsed] = useState(!defaultOpen);

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored === '1') setCollapsed(true);
    else if (stored === '0') setCollapsed(false);
    // else keep defaultOpen
  }, [storageKey]);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(storageKey, next ? '1' : '0');
  }

  const colClass = COLS[columns] ?? COLS[3];

  return (
    <div className="card overflow-hidden border-blue-500/20">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-800/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-slate-300">{title}</span>
        </div>
        {collapsed
          ? <ChevronDown className="w-4 h-4 text-slate-500" />
          : <ChevronUp   className="w-4 h-4 text-slate-500" />}
      </button>

      {!collapsed && (
        <div className="px-5 pb-4 pt-1">
          {subtitle && (
            <p className="text-xs text-slate-500 mb-3">
              <span className="text-slate-200 font-medium">{subtitle}</span>
            </p>
          )}
          <div className={`grid gap-3 ${colClass}`}>
            {steps.map((s) => (
              <div key={s.title} className="bg-slate-800/40 rounded-xl p-3.5">
                {s.icon && (
                  <div className="w-6 h-6 rounded-lg bg-blue-500/10 flex items-center justify-center mb-2">
                    <s.icon className="w-3.5 h-3.5 text-blue-400" />
                  </div>
                )}
                <div className="text-xs font-semibold text-slate-200 mb-1">{s.title}</div>
                <p className="text-xs text-slate-400 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
