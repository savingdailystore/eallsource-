import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, decimals = 2): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function buildAmazonUrl(asin: string): string {
  return `https://www.amazon.com/dp/${asin}`;
}

export function buildKeepaUrl(asin: string): string {
  return `https://keepa.com/#!product/1-${asin}`;
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

export function relativeTime(date: Date | string): string {
  const d   = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days  = Math.floor(hours / 24);
  if (days < 30)  return `${days}d ago`;
  return d.toLocaleDateString();
}

export function generateOrgSlug(name: string): string {
  return `${slugify(name)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function assertOrgAccess(sessionOrgId: string, resourceOrgId: string) {
  if (sessionOrgId !== resourceOrgId) {
    throw new Error('Forbidden: cross-tenant access denied');
  }
}
