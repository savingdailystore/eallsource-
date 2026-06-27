import { describe, it, expect, beforeEach } from 'vitest';
import { isRateLimited, recordAttempt, resetAttempts, __resetAllForTests } from './rate-limit';

// These tests exercise the in-memory fallback path (no REDIS_URL set in the
// test environment), which is what actually runs in this project's CI and in
// local dev. The Redis path is a thin pass-through to ioredis and is not
// re-tested here.

describe('rate-limit (in-memory fallback)', () => {
  beforeEach(() => {
    __resetAllForTests();
  });

  it('is not limited before any attempts are recorded', async () => {
    const status = await isRateLimited('test:fresh-key', 3, 60);
    expect(status.limited).toBe(false);
    expect(status.retryAfterSeconds).toBe(0);
  });

  it('allows attempts up to the max', async () => {
    const key = 'test:under-max';
    await recordAttempt(key, 60);
    await recordAttempt(key, 60);
    const status = await isRateLimited(key, 3, 60);
    expect(status.limited).toBe(false);
  });

  it('limits once attempts reach the max', async () => {
    const key = 'test:at-max';
    await recordAttempt(key, 60);
    await recordAttempt(key, 60);
    await recordAttempt(key, 60);
    const status = await isRateLimited(key, 3, 60);
    expect(status.limited).toBe(true);
    expect(status.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('resetAttempts clears the counter so the key is no longer limited', async () => {
    const key = 'test:reset';
    await recordAttempt(key, 60);
    await recordAttempt(key, 60);
    await recordAttempt(key, 60);
    expect((await isRateLimited(key, 3, 60)).limited).toBe(true);

    await resetAttempts(key);

    expect((await isRateLimited(key, 3, 60)).limited).toBe(false);
  });

  it('tracks distinct keys independently', async () => {
    await recordAttempt('test:key-a', 60);
    await recordAttempt('test:key-a', 60);
    await recordAttempt('test:key-a', 60);
    await recordAttempt('test:key-b', 60);

    expect((await isRateLimited('test:key-a', 3, 60)).limited).toBe(true);
    expect((await isRateLimited('test:key-b', 3, 60)).limited).toBe(false);
  });

  it('expires the window so attempts are not limited forever', async () => {
    const key = 'test:short-window';
    await recordAttempt(key, 0); // window already expired by the time we check
    await recordAttempt(key, 0);
    await recordAttempt(key, 0);
    // A 0-second window means resetAt === now (or in the past) almost
    // immediately, so a fresh check should no longer see it as limited.
    await new Promise((r) => setTimeout(r, 10));
    expect((await isRateLimited(key, 3, 0)).limited).toBe(false);
  });
});
