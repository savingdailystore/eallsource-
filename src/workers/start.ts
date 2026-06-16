import { startWorkers } from './index';

const REDIS_URL = process.env.REDIS_URL ?? '';

if (!REDIS_URL || REDIS_URL.includes('localhost') || REDIS_URL.includes('127.0.0.1')) {
  console.error('REDIS_URL must point to a real Redis instance to start workers.');
  console.error('Set REDIS_URL to your Redis Cloud / Upstash / etc. URL and restart.');
  process.exit(1);
}

startWorkers(REDIS_URL);
