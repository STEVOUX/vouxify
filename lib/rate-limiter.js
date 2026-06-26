'use strict';

/**
 * lib/rate-limiter.js — Simple IP-based rate limiting via Redis.
 */

const { getRedis } = require('./redis');

const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_REQUESTS || '20');
const WINDOW_MS    = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '3600000');

async function checkRateLimit(ip, platform = 'default') {
  if (!ip || ip === 'unknown') return { allowed: true };
  try {
    const redis = getRedis();
    const key = `rl:${ip}:${platform}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, Math.ceil(WINDOW_MS / 1000));
    }
    return { allowed: count <= MAX_REQUESTS, count, limit: MAX_REQUESTS };
  } catch {
    return { allowed: true }; // Allow on Redis failure
  }
}

async function markActive(ip, platform) { /* no-op */ }
async function markDone(ip, platform) { /* no-op */ }

module.exports = { checkRateLimit, markActive, markDone };
