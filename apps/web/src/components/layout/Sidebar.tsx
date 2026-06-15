'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  TrendingUp,
  LayoutDashboard,
  Package,
  Bookmark,
  CalendarDays,
  Settings,
  Users,
  ScanLine,
  LogOut,
  ChevronRight,
  Zap,
  Warehouse,
  ArrowUpDown,
  Brain,
  Flame,
} from 'lucide-react';
import { signOut } from 'next-auth/react';
import { cn } from '@lib/utils';

const USER_NAV = [
  { label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Products', href: '/dashboard/products', icon: Package },
  { label: 'Saved', href: '/dashboard/saved', icon: Bookmark },
  { label: 'Inventory', href: '/dashboard/inventory', icon: Warehouse },
  { label: 'Arbitrage AI', href: '/dashboard/ai-sourcing', icon: Brain },
  { label: 'Leads', href: '/dashboard/leads', icon: Flame },
  { label: 'AI Repricer', href: '/dashboard/repricer', icon: ArrowUpDown },
  { label: 'Weekly Feed', href: '/dashboard/weekly', icon: CalendarDays },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
];

const ADMIN_NAV = [
  { label: 'Users', href: '/admin/users', icon: Users },
  { label: 'Scan Control', href: '/admin/scans', icon: ScanLine },
];

interface SidebarProps {
  isAdmin?: boolean;
  userName?: string;
  userEmail?: string;
  plan?: string;
}

export function Sidebar({ isAdmin, userName, userEmail, plan }: SidebarProps) {
  const pathname = usePathname();

  function NavItem({ label, href, icon: Icon }: { label: string; href: string; icon: React.ElementType }) {
    const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
    return (
      <Link
        href={href}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group',
          active
            ? 'bg-green-600 text-white shadow-md shadow-green-200'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
        )}
      >
        <Icon className={cn('w-4 h-4 shrink-0', active ? 'text-white' : 'text-gray-400 group-hover:text-gray-600')} />
        {label}
        {active && <ChevronRight className="w-3.5 h-3.5 ml-auto text-white/70" />}
      </Link>
    );
  }

  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 bg-white border-r border-gray-100 flex flex-col">
      {/* Logo */}
      <div className="p-5 border-b border-gray-100">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center shadow shadow-green-200">
            <TrendingUp className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <div className="font-bold text-sm text-gray-900 leading-tight">EALLsource</div>
            <div className="text-xs text-gray-400">Amazon OA Sourcing</div>
          </div>
        </Link>
      </div>

      {/* Plan badge */}
      {plan && plan !== 'FREE' && (
        <div className="mx-4 mt-3 flex items-center gap-1.5 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg">
          <Zap className="w-3.5 h-3.5 text-green-600" />
          <span className="text-xs font-semibold text-green-700">{plan} Plan</span>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">
          Dashboard
        </div>
        {USER_NAV.map((item) => (
          <NavItem key={item.href} {...item} />
        ))}

        {isAdmin && (
          <>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mt-5 mb-2">
              Admin
            </div>
            {ADMIN_NAV.map((item) => (
              <NavItem key={item.href} {...item} />
            ))}
          </>
        )}
      </nav>

      {/* User */}
      <div className="p-4 border-t border-gray-100">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
            <span className="text-green-700 font-bold text-xs">
              {userName?.charAt(0)?.toUpperCase() ?? 'U'}
            </span>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate">{userName ?? 'User'}</div>
            <div className="text-xs text-gray-400 truncate">{userEmail}</div>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
