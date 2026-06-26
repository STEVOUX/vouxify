'use strict';

/**
 * lib/job-store.js — Job persistence layer.
 * Uses Redis when available, falls back to in-memory Map.
 */

const { EventEmitter } = require('events');
const { v4: uuid } = require('uuid');
const { getRedis } = require('./redis');

const JOB_TTL_SECONDS = 3600; // 1 hour

/* ── In-memory bus for progress events (fallback) ───────────── */
if (!global._memoryBus) {
  global._memoryBus = new EventEmitter();
  global._memoryBus.setMaxListeners(500);
}
const memoryBus = global._memoryBus;

/* ── Helpers ─────────────────────────────────────────────────── */
function jobKey(jobId) { return `vouxify:job:${jobId}`; }
function progressChannel(jobId) { return `job-progress:${jobId}`; }

/* ── Public API ──────────────────────────────────────────────── */

/**
 * Create a new job record and return its ID.
 */
async function createJob(data) {
  const jobId = data.jobId || uuid();
  const record = {
    jobId,
    status: 'queued',
    progress: 0,
    progressMessage: '',
    createdAt: Date.now(),
    ...data,
  };

  try {
    const redis = getRedis();
    await redis.setex(jobKey(jobId), JOB_TTL_SECONDS, JSON.stringify(record));
  } catch (err) {
    console.warn('[job-store] Redis unavailable, using memory:', err.message);
    // Store in global fallback map
    global._vouxifyJobs = global._vouxifyJobs || new Map();
    global._vouxifyJobs.set(jobId, record);
  }

  return jobId;
}

/**
 * Update fields on an existing job.
 */
async function updateJob(jobId, updates) {
  try {
    const redis = getRedis();
    const raw = await redis.get(jobKey(jobId));
    const existing = raw ? JSON.parse(raw) : { jobId };
    const merged = { ...existing, ...updates, updatedAt: Date.now() };
    await redis.setex(jobKey(jobId), JOB_TTL_SECONDS, JSON.stringify(merged));
  } catch {
    global._vouxifyJobs = global._vouxifyJobs || new Map();
    const existing = global._vouxifyJobs.get(jobId) || { jobId };
    global._vouxifyJobs.set(jobId, { ...existing, ...updates, updatedAt: Date.now() });
  }
}

/**
 * Get a job record by ID.
 */
async function getJob(jobId) {
  try {
    const redis = getRedis();
    const raw = await redis.get(jobKey(jobId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    global._vouxifyJobs = global._vouxifyJobs || new Map();
    return global._vouxifyJobs.get(jobId) || null;
  }
}

/**
 * Publish a progress event to listeners.
 */
async function publishProgress(jobId, progress, message, extra = {}) {
  const payload = {
    jobId,
    progress,
    message,
    status: progress >= 100 ? 'completed' : progress < 0 ? 'failed' : 'processing',
    ...extra,
  };

  // Emit on in-memory bus (for SSE fallback polling)
  memoryBus.emit(`job:${jobId}`, payload);

  // Publish to Redis pub/sub
  try {
    const redis = getRedis();
    await redis.publish(progressChannel(jobId), JSON.stringify(payload));
  } catch {
    // Ignore publish errors
  }

  // Update job record
  await updateJob(jobId, {
    progress,
    progressMessage: message,
  }).catch(() => {});
}

/**
 * Subscribe to progress events for a job (in-memory bus).
 */
function subscribeProgress(jobId, callback) {
  const event = `job:${jobId}`;
  memoryBus.on(event, callback);
  return () => memoryBus.off(event, callback);
}

module.exports = { createJob, updateJob, getJob, publishProgress, subscribeProgress };