import { redis } from './redis';

/**
 * Best-effort request/attempt limiter. Uses Redis when configured
 * (REDIS_URL set to a real, non-local instance — see redis.ts) so limits are
 * shared across serverless instances. Falls back to an in-memory counter per
 * warm Vercel function instance when Redis isn't configured, which is not
 * perfectly distributed but still meaningfully throttles a single attacker
 * hitting a single warm instance — strictly better than no limiting, and the
 * same call sites upgrade to fully distributed limiting the moment REDIS_URL
 * is set, with no code change required.
 */

const KEY_PREFIX = 'ratelimit:';

interface MemoryEntry {
  count: number;
  resetAt: number; // epoch ms
}

const memoryStore = new Map<string, MemoryEntry>();

// Bound the in-memory map so a flood of distinct keys (e.g. many distinct
// emails/IPs) can't grow it unboundedly between cold starts.
const MAX_MEMORY_ENTRIES = 10_000;

function pruneMemoryStoreIfNeeded() {
  if (memoryStore.size <= MAX_MEMORY_ENTRIES) return;
  const now = Date.now();
  for (const [key, entry] of memoryStore) {
    if (entry.resetAt <= now) memoryStore.delete(key);
  }
  // Still too large after pruning expired entries — drop the oldest half.
  if (memoryStore.size > MAX_MEMORY_ENTRIES) {
    const keys = [...memoryStore.keys()].slice(0, memoryStore.size - MAX_MEMORY_ENTRIES);
    for (const key of keys) memoryStore.delete(key);
  }
}

export interface RateLimitStatus {
  limited: boolean;
  /** Seconds until the caller may retry (0 if not limited). */
  retryAfterSeconds: number;
}

/**
 * Read-only check: is `key` currently over `max` recorded attempts within
 * the current window? Does not record an attempt itself — call
 * `recordAttempt` separately (typically only on a failed attempt).
 */
export async function isRateLimited(key: string, max: number, windowSeconds: number): Promise<RateLimitStatus> {
  const fullKey = `${KEY_PREFIX}${key}`;

  if (redis) {
    try {
      const [countStr, ttl] = await Promise.all([redis.get(fullKey), redis.ttl(fullKey)]);
      const count = countStr ? parseInt(countStr, 10) : 0;
      const limited = count >= max;
      return { limited, retryAfterSeconds: limited ? Math.max(ttl, 1) : 0 };
    } catch {
      // Redis hiccup — fail open rather than locking everyone out.
      return { limited: false, retryAfterSeconds: 0 };
    }
  }

  const entry = memoryStore.get(fullKey);
  const now = Date.now();
  if (!entry || entry.resetAt <= now) return { limited: false, retryAfterSeconds: 0 };
  const limited = entry.count >= max;
  return { limited, retryAfterSeconds: limited ? Math.ceil((entry.resetAt - now) / 1000) : 0 };
}

/**
 * Record one attempt against `key`, starting a new `windowSeconds` window if
 * none is active. Returns the new count within the current window.
 */
export async function recordAttempt(key: string, windowSeconds: number): Promise<number> {
  const fullKey = `${KEY_PREFIX}${key}`;

  if (redis) {
    try {
      const count = await redis.incr(fullKey);
      if (count === 1) await redis.expire(fullKey, windowSeconds);
      return count;
    } catch {
      return 0;
    }
  }

  pruneMemoryStoreIfNeeded();
  const now = Date.now();
  const entry = memoryStore.get(fullKey);
  if (!entry || entry.resetAt <= now) {
    memoryStore.set(fullKey, { count: 1, resetAt: now + windowSeconds * 1000 });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

/** Clear any recorded attempts for `key` — call on a successful attempt. */
export async function resetAttempts(key: string): Promise<void> {
  const fullKey = `${KEY_PREFIX}${key}`;
  if (redis) {
    try {
      await redis.del(fullKey);
    } catch { /* ignore */ }
    return;
  }
  memoryStore.delete(fullKey);
}

/** Test-only: clears all in-memory rate-limit state between test cases. */
export function __resetAllForTests(): void {
  memoryStore.clear();
}
