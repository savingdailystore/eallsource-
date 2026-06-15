import Redis from 'ioredis';

const globalForRedis = globalThis as unknown as { redis: Redis };

export const redis =
  globalForRedis.redis ||
  new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis;

export async function getCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds = 300,
): Promise<T> {
  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached) as T;
  } catch {
    // Redis unavailable — fall through to fetcher
  }

  const result = await fetcher();

  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(result));
  } catch {
    // Redis unavailable — ignore cache write
  }

  return result;
}

export async function invalidateCache(pattern: string) {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
  } catch {
    // Redis unavailable
  }
}
