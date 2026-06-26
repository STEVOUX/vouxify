'use strict';

/**
 * lib/redis.js — Redis client with in-memory fallback.
 * When REDIS_URL is not set, uses a simple in-memory mock so the app
 * works without Redis (dev mode / no-Redis Railway deployments).
 */

const { EventEmitter } = require('events');

/* ── In-memory mock (no Redis) ──────────────────────────────── */
class MockRedis extends EventEmitter {
  constructor(label = 'mock') {
    super();
    this.label = label;
    this._store = new Map();
    this._timers = new Map();
    this._subs = new Map();
  }

  async get(key) { return this._store.get(key) ?? null; }

  async set(key, value, ...args) {
    this._store.set(key, value);
    // Handle EX / PX TTL
    const exIdx = args.indexOf('EX');
    const pxIdx = args.indexOf('PX');
    if (exIdx !== -1 && args[exIdx + 1]) this._expire(key, Number(args[exIdx + 1]) * 1000);
    if (pxIdx !== -1 && args[pxIdx + 1]) this._expire(key, Number(args[pxIdx + 1]));
    return 'OK';
  }

  async setex(key, ttlSec, value) {
    this._store.set(key, value);
    this._expire(key, ttlSec * 1000);
    return 'OK';
  }

  async del(key) { this._store.delete(key); return 1; }
  async exists(key) { return this._store.has(key) ? 1 : 0; }
  async hset(key, ...args) { if (!this._store.has(key)) this._store.set(key, {}); const h = this._store.get(key); for (let i = 0; i < args.length; i += 2) h[args[i]] = args[i+1]; return 1; }
  async hget(key, field) { const h = this._store.get(key); return h ? h[field] ?? null : null; }
  async hgetall(key) { return this._store.get(key) ?? null; }
  async incr(key) { const v = Number(this._store.get(key) ?? 0) + 1; this._store.set(key, String(v)); return v; }
  async expire(key, ttlSec) { this._expire(key, ttlSec * 1000); return 1; }
  async publish(channel, msg) { this.emit('message', channel, msg); return 0; }
  async subscribe(channel) { /* no-op for mock */ }
  async unsubscribe(channel) { /* no-op */ }
  async ping() { return 'PONG'; }
  async quit() { return 'OK'; }
  duplicate() { const m = new MockRedis(this.label + '-dup'); m._store = this._store; return m; }
  on(event, cb) { super.on(event, cb); return this; }

  _expire(key, ms) {
    const prev = this._timers.get(key);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => this._store.delete(key), ms);
    if (t.unref) t.unref();
    this._timers.set(key, t);
  }
}

/* ── Singleton clients ───────────────────────────────────────── */
global._redisPrimary = global._redisPrimary || null;
global._redisSubscriber = global._redisSubscriber || null;
let isShuttingDown = false;

function buildOptions(label) {
  return {
    lazyConnect: true,
    enableReadyCheck: false,
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
      if (isShuttingDown) return null;
      const delay = Math.min(times * 500, 5000);
      return delay;
    },
  };
}

function getRedis() {
  if (global._redisPrimary) return global._redisPrimary;
  const url = process.env.REDIS_URL;
  if (!url) {
    global._redisPrimary = new MockRedis('primary');
    return global._redisPrimary;
  }
  try {
    const Redis = require('ioredis');
    global._redisPrimary = new Redis(url, buildOptions('primary'));
    global._redisPrimary.on('error', (err) => console.error('[Redis] Error:', err.message));
    global._redisPrimary.connect().catch(() => {});
  } catch (err) {
    console.error('[Redis] Init failed, using mock:', err.message);
    global._redisPrimary = new MockRedis('primary-fallback');
  }
  return global._redisPrimary;
}

function getSubscriber() {
  if (global._redisSubscriber) return global._redisSubscriber;
  const url = process.env.REDIS_URL;
  if (!url) {
    global._redisSubscriber = new MockRedis('subscriber');
    return global._redisSubscriber;
  }
  try {
    const Redis = require('ioredis');
    global._redisSubscriber = new Redis(url, buildOptions('subscriber'));
    global._redisSubscriber.on('error', (err) => console.error('[Redis-sub] Error:', err.message));
    global._redisSubscriber.connect().catch(() => {});
  } catch (err) {
    global._redisSubscriber = new MockRedis('subscriber-fallback');
  }
  return global._redisSubscriber;
}

async function shutdown() {
  isShuttingDown = true;
  try { if (global._redisPrimary && global._redisPrimary.quit) await global._redisPrimary.quit(); } catch {}
  try { if (global._redisSubscriber && global._redisSubscriber.quit) await global._redisSubscriber.quit(); } catch {}
}

module.exports = { getRedis, getSubscriber, shutdown };
