import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? '';
const REDIS_ENABLED =
  REDIS_URL.length > 0 &&
  !REDIS_URL.includes('localhost') &&
  !REDIS_URL.includes('127.0.0.1');

const globalForRedis = globalThis as unknown as { redis: Redis | null };

export const redis: Redis | null = REDIS_ENABLED
  ? (globalForRedis.redis ??
      new Redis(REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: true }))
  : null;

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis;

export async function getCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds = 300,
): Promise<T> {
  if (redis) {
    try {
      const cached = await redis.get(key);
      if (cached) return JSON.parse(cached) as T;
    } catch {
      // Redis unavailable — fall through to fetcher
    }
  }

  const result = await fetcher();

  if (redis) {
    try {
      await redis.setex(key, ttlSeconds, JSON.stringify(result));
    } catch {
      // ignore cache write failure
    }
  }

  return result;
}

export async function invalidateCache(pattern: string) {
  if (!redis) return;
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
  } catch {
    // Redis unavailable
  }
}
