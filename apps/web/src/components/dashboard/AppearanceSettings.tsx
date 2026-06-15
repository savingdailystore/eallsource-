'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/layout/ThemeProvider';

const OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun, desc: 'Clean white interface' },
  { value: 'dark',  label: 'Dark',  icon: Moon, desc: 'Easy on the eyes' },
] as const;

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6">
      <div className="flex items-center gap-3 mb-5">
        <Monitor className="w-5 h-5 text-gray-400" />
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Appearance</h2>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Choose how EALLsource looks on your device.
      </p>

      <div className="grid grid-cols-2 gap-3 max-w-sm">
        {OPTIONS.map(({ value, label, icon: Icon, desc }) => {
          const active = theme === value;
          return (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={`relative flex flex-col items-center gap-2.5 p-5 rounded-2xl border-2 transition-all ${
                active
                  ? 'border-green-500 bg-green-50 dark:bg-green-950'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800'
              }`}
            >
              {/* Theme preview thumbnail */}
              <div className={`w-full h-14 rounded-xl overflow-hidden border ${
                value === 'dark'
                  ? 'bg-gray-900 border-gray-700'
                  : 'bg-white border-gray-200'
              }`}>
                <div className={`h-4 ${value === 'dark' ? 'bg-gray-800' : 'bg-gray-100'} flex items-center px-2 gap-1`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${value === 'dark' ? 'bg-gray-600' : 'bg-gray-300'}`} />
                  <span className={`w-6 h-1 rounded-full ${value === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`} />
                </div>
                <div className="p-1.5 space-y-1">
                  <div className={`h-1.5 rounded-full w-3/4 ${value === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`} />
                  <div className={`h-1.5 rounded-full w-1/2 ${value === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`} />
                  <div className={`h-1.5 rounded-full w-2/3 ${value === 'dark' ? 'bg-green-900' : 'bg-green-100'}`} />
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <Icon className={`w-4 h-4 ${active ? 'text-green-600' : 'text-gray-400 dark:text-gray-500'}`} />
                <span className={`text-sm font-semibold ${active ? 'text-green-700 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>
                  {label}
                </span>
              </div>
              <span className={`text-xs ${active ? 'text-green-600 dark:text-green-500' : 'text-gray-400 dark:text-gray-500'}`}>
                {desc}
              </span>

              {active && (
                <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-green-500" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
