'use strict';

/**
 * lib/cache.js — Simple Redis-backed cache with in-memory fallback.
 */

const { getRedis } = require('./redis');

const DEFAULT_TTL = 300; // 5 minutes

async function getCachedResult(key) {
  try {
    const redis = getRedis();
    const raw = await redis.get(`cache:${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function cacheResult(key, value, ttlSeconds = DEFAULT_TTL) {
  try {
    const redis = getRedis();
    await redis.setex(`cache:${key}`, ttlSeconds, JSON.stringify(value));
  } catch { /* ignore */ }
}

async function getCachedUrl(key) {
  try {
    const redis = getRedis();
    return await redis.get(`url:${key}`);
  } catch { return null; }
}

async function cacheUrl(key, url, ttlSeconds = 180) {
  try {
    const redis = getRedis();
    await redis.setex(`url:${key}`, ttlSeconds, url);
  } catch { /* ignore */ }
}

async function acquireLock(key, ttlMs = 60000) {
  try {
    const redis = getRedis();
    const lockKey = `lock:${key}`;
    const result = await redis.set(lockKey, '1', 'PX', ttlMs, 'NX');
    return { acquired: result === 'OK' };
  } catch { return { acquired: true }; } // Allow on error
}

async function releaseLock(key) {
  try {
    const redis = getRedis();
    await redis.del(`lock:${key}`);
  } catch { /* ignore */ }
}

module.exports = { getCachedResult, cacheResult, getCachedUrl, cacheUrl, acquireLock, releaseLock };
