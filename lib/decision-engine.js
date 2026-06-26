// @ts-check
'use strict';

/**
 * @module decision-engine
 * @description Request router for VOUXIFY.
 *
 * Determines whether an incoming download request should be served via
 * the zero-disk streaming engine (fast path) or enqueued as a BullMQ
 * background job (heavy path — playlists, albums, fallback).
 *
 * Guarantees:
 *  - Rate-limit + resource-guard checked FIRST
 *  - Cache hits returned instantly
 *  - Duplicate URLs deduplicated via distributed lock
 *  - Job-type responses return in < 300 ms
 */

const { getCachedResult, acquireLock, releaseLock } = require('./cache');
const { getMetadata } = require('./extractor');
const { checkRateLimit, markActive, markDone } = require('./rate-limiter');
const { validateRequest } = require('./resource-guard');
const { getQueue } = require('./queues');
const { createJob, updateJob, getJob } = require('./job-store');
const { streamMedia } = require('./streaming-engine');
const { getBurstHandler } = require('./burst-handler');
const { classifyError, getUserMessage } = require('./error-classifier');
const logger = require('./logger');

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

/** Maximum video duration (seconds) eligible for streaming path */
const MAX_STREAM_DURATION_S = 1200; // 20 minutes

/** Maximum estimated file size (bytes) eligible for streaming */
const MAX_STREAM_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB

/** Lock TTL — how long a URL-level dedup lock is held (ms) */
const DEDUP_LOCK_TTL_MS = 120_000; // 2 minutes

/** Metadata timeout — quick yt-dlp -j call shouldn't exceed this (ms) */
const METADATA_TIMEOUT_MS = 15_000;

/** Streamable formats — formats that support the streaming path */
const STREAMABLE_FORMATS = new Set(['video', 'audio']);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Build a canonical cache / lock key for a URL + options combo.
 * @param {string} url
 * @param {string} platform
 * @param {{ format?: string, quality?: string }} opts
 * @returns {string}
 */
function buildKey(url, platform, opts) {
  return `req:${platform}:${url}:${opts.format || 'video'}:${opts.quality || 'best'}`;
}

/**
 * Determine if metadata describes a single item or a collection.
 * @param {object} meta
 * @returns {'single'|'collection'}
 */
function classifyMedia(meta) {
  if (!meta) return 'single';

  // yt-dlp sets _type to 'playlist' for playlists / channels
  if (meta._type === 'playlist' || meta.entries) return 'collection';
  if (meta.playlist_count && meta.playlist_count > 1) return 'collection';

  return 'single';
}

/**
 * Determine whether the single item is small / short enough for streaming.
 * @param {object} meta
 * @returns {boolean}
 */
function isStreamable(meta) {
  if (!meta) return true; // Optimistic — try streaming

  const duration = meta.duration || 0;
  if (duration > MAX_STREAM_DURATION_S) return false;

  const filesize = meta.filesize || meta.filesize_approx || 0;
  if (filesize > MAX_STREAM_SIZE_BYTES) return false;

  return true;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * @typedef {Object} StreamResult
 * @property {'stream'} type
 * @property {() => Promise<{ stream: ReadableStream, headers: object }>} streamFn
 * @property {object} [meta] - Optional metadata from extraction
 */

/**
 * @typedef {Object} JobResult
 * @property {'job'} type
 * @property {string} jobId
 * @property {object} [meta] - Optional metadata
 */

/**
 * @typedef {Object} CachedResult
 * @property {'cached'} type
 * @property {object} data
 */

/**
 * Process an incoming download request and route it appropriately.
 *
 * @param {string} url        - Original media URL
 * @param {string} platform   - Detected platform (youtube, spotify, etc.)
 * @param {{ format?: 'video'|'audio', quality?: '1080'|'720'|'480'|'best', ip?: string }} [options]
 * @returns {Promise<StreamResult | JobResult | CachedResult>}
 * @throws {Error} On rate-limit, validation failure, or unrecoverable errors
 */
async function processRequest(url, platform, options = {}) {
  const opts = {
    format: options.format || 'video',
    quality: options.quality || 'best',
    ip: options.ip || 'unknown',
  };

  const requestKey = buildKey(url, platform, opts);

  /* ---- 1. Rate-limit check ---- */
  try {
    const rl = await checkRateLimit(opts.ip, platform);
    if (!rl.allowed) {
      const err = new Error('Rate limit exceeded. Please try again later.');
      // @ts-ignore
      err.code = 'RATE_LIMITED';
      // @ts-ignore
      err.statusCode = 429;
      // @ts-ignore
      err.retryAfterMs = rl.retryAfterMs || 60_000;
      throw err;
    }
  } catch (rlErr) {
    // If it's our own rate-limit error, rethrow
    // @ts-ignore
    if (rlErr.code === 'RATE_LIMITED') throw rlErr;
    // Otherwise Redis might be down — log and allow through
    logger.warn('[decision-engine] Rate-limit check failed, allowing request', {
      error: rlErr.message,
    });
  }

  /* ---- 2. Resource guard / URL validation ---- */
  const validation = await validateRequest(url, platform, opts);
  if (!validation.valid) {
    const err = new Error(validation.reason || 'Invalid request');
    // @ts-ignore
    err.code = 'INVALID_REQUEST';
    // @ts-ignore
    err.statusCode = 400;
    throw err;
  }

  /* ---- 3. Cache check ---- */
  try {
    const cached = await getCachedResult(requestKey);
    if (cached) {
      logger.info('[decision-engine] Cache HIT — returning cached result', { platform, url });
      return { type: 'cached', data: cached };
    }
  } catch (cacheErr) {
    logger.warn('[decision-engine] Cache read failed', { error: cacheErr.message });
  }

  /* ---- 4. Duplicate-lock check ---- */
  let lockAcquired = false;
  try {
    const lockResult = await acquireLock(requestKey, DEDUP_LOCK_TTL_MS);

    if (!lockResult.acquired) {
      // Another request for the same URL is in-flight — return existing jobId
      if (lockResult.existingJobId) {
        logger.info('[decision-engine] Duplicate detected, returning existing job', {
          jobId: lockResult.existingJobId,
        });
        return { type: 'job', jobId: lockResult.existingJobId };
      }
      // Lock exists but no jobId — wait briefly then try streaming anyway
      logger.info('[decision-engine] Duplicate lock exists without jobId, proceeding cautiously');
    } else {
      lockAcquired = true;
    }
  } catch (lockErr) {
    logger.warn('[decision-engine] Lock acquisition failed, proceeding', {
      error: lockErr.message,
    });
  }

  /* ---- 5. Burst-aware quality adjustment ---- */
  let adjustedQuality = opts.quality;
  try {
    const burst = getBurstHandler();
    burst.recordRequest();
    const loadLevel = burst.getLoadLevel();

    if (loadLevel !== 'normal') {
      adjustedQuality = burst.getAdjustedQuality(opts.quality, loadLevel);
      if (adjustedQuality !== opts.quality) {
        logger.info('[decision-engine] Quality adjusted for load', {
          requested: opts.quality,
          adjusted: adjustedQuality,
          loadLevel,
        });
      }
    }
  } catch (burstErr) {
    logger.warn('[decision-engine] Burst handler error', { error: burstErr.message });
  }

  const finalOpts = { ...opts, quality: adjustedQuality };

  /* ---- 6. Get metadata ---- */
  let meta = null;
  try {
    meta = await Promise.race([
      getMetadata(url, { platform }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Metadata timeout')), METADATA_TIMEOUT_MS)
      ),
    ]);
  } catch (metaErr) {
    logger.warn('[decision-engine] Metadata fetch failed, will attempt streaming', {
      error: metaErr.message,
    });
    // Proceed without metadata — streaming will either work or fail gracefully
  }

  // Validate duration / size from metadata
  if (meta && meta.duration && meta.duration > 7200) {
    // 2 hours hard cap
    const err = new Error('Media exceeds maximum allowed duration (2 hours)');
    // @ts-ignore
    err.code = 'MEDIA_TOO_LONG';
    // @ts-ignore
    err.statusCode = 400;
    if (lockAcquired) {
      try { await releaseLock(requestKey); } catch { /* ignore */ }
    }
    throw err;
  }

  /* ---- 7. Route decision ---- */
  const mediaType = classifyMedia(meta);

  // --- Collection (playlist / album) → always job ---
  if (mediaType === 'collection') {
    logger.info('[decision-engine] Collection detected, routing to job queue', { platform });
    return await enqueueJob(url, platform, finalOpts, meta, requestKey, lockAcquired);
  }

  // --- Single item: try streaming if eligible ---
  if (STREAMABLE_FORMATS.has(finalOpts.format) && isStreamable(meta)) {
    logger.info('[decision-engine] Single streamable item, returning stream function', {
      platform,
    });

    try {
      await markActive(opts.ip, platform);
    } catch {
      // Non-critical
    }

    /**
     * Lazy stream function — called by the API route when it's ready to pipe.
     * If streaming fails, it falls back to the job queue.
     */
    const streamFn = async () => {
      try {
        const result = await streamMedia(url, platform, {
          format: finalOpts.format,
          quality: finalOpts.quality,
        });
        return result;
      } catch (streamErr) {
        logger.warn('[decision-engine] Streaming failed, falling back to job', {
          platform,
          error: streamErr.message,
        });
        // Fallback: enqueue as job and throw a special error
        const fallback = await enqueueJob(url, platform, finalOpts, meta, requestKey, lockAcquired);
        const fallbackErr = new Error('Streaming unavailable, job enqueued');
        // @ts-ignore
        fallbackErr.code = 'STREAM_FALLBACK';
        // @ts-ignore
        fallbackErr.fallback = fallback;
        throw fallbackErr;
      } finally {
        try {
          await markDone(opts.ip, platform);
        } catch {
          // Non-critical
        }
      }
    };

    return { type: 'stream', streamFn, meta };
  }

  // --- Non-streamable single item or format → job ---
  logger.info('[decision-engine] Non-streamable item, routing to job queue', { platform });
  return await enqueueJob(url, platform, finalOpts, meta, requestKey, lockAcquired);
}

/**
 * Enqueue a BullMQ job and return within ~300 ms.
 *
 * @param {string} url
 * @param {string} platform
 * @param {object} opts
 * @param {object|null} meta
 * @param {string} requestKey
 * @param {boolean} lockAcquired
 * @returns {Promise<JobResult>}
 */
async function enqueueJob(url, platform, opts, meta, requestKey, lockAcquired) {
  try {
    // Create job record in store
    const jobId = await createJob({
      url,
      platform,
      format: opts.format,
      quality: opts.quality,
      ip: opts.ip,
      status: 'queued',
      meta: meta ? { title: meta.title, duration: meta.duration } : null,
    });

    // Add to BullMQ queue
    const queue = getQueue(platform);
    await queue.add(
      `${platform}-download`,
      {
        jobId,
        url,
        platform,
        format: opts.format,
        quality: opts.quality,
        meta,
      },
      {
        jobId, // Use our jobId as BullMQ job ID for correlation
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 86400, count: 5000 },
      }
    );

    logger.info('[decision-engine] Job enqueued', { jobId, platform, url });

    return { type: 'job', jobId, meta };
  } catch (enqueueErr) {
    // Release lock if we acquired one
    if (lockAcquired) {
      try {
        await releaseLock(requestKey);
      } catch {
        /* ignore */
      }
    }

    const classified = classifyError(enqueueErr, platform);
    const userMsg = getUserMessage(classified);
    const err = new Error(userMsg);
    // @ts-ignore
    err.code = 'ENQUEUE_FAILED';
    // @ts-ignore
    err.statusCode = 503;
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/*  Exports                                                            */
/* ------------------------------------------------------------------ */

module.exports = { processRequest };
