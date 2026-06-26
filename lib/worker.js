// @ts-check
'use strict';

/**
 * @module worker
 * @description BullMQ worker for VOUXIFY background download jobs.
 *
 * Handles two job types:
 *  1. Streaming jobs  — extract URL, cache, set result (fast path fallback)
 *  2. Download jobs    — spawn yt-dlp, parse progress, write to /tmp
 *
 * Worker concurrency per platform queue:
 *   streaming: 3, youtube: 6, spotify: 3, instagram: 2, tiktok: 2
 *
 * yt-dlp progress is parsed from stderr and published as 0-100 progress.
 * Graceful shutdown: on SIGTERM/SIGINT workers finish current jobs then exit.
 */

const { Worker } = require('bullmq');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const { getRedis } = require('./redis');
const { cacheUrl } = require('./cache');
const { updateJob, publishProgress } = require('./job-store');
const { extractUrl, extractFreshUrl } = require('./extractor');
const { classifyError, getUserMessage } = require('./error-classifier');
const { getBreaker } = require('./circuit-breaker');
const logger = require('./logger');

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

/** Per-platform concurrency settings */
const CONCURRENCY = {
  streaming: 3,
  youtube: 6,
  spotify: 3,
  instagram: 2,
  tiktok: 2,
};

/** All platform queues the worker subscribes to */
const PLATFORMS = Object.keys(CONCURRENCY);

/** Worker job timeout (ms) */
const JOB_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/** Temp directory for downloads */
const TMP_DIR = os.tmpdir();

/** URL cache TTL (seconds) */
const URL_CACHE_TTL_S = 180;

/** Maximum number of retries BullMQ will attempt */
const MAX_ATTEMPTS = 3;

/* ------------------------------------------------------------------ */
/*  yt-dlp progress parser                                            */
/* ------------------------------------------------------------------ */

/**
 * Parse a yt-dlp stderr line and return a progress percentage (0-100) or null.
 *
 * yt-dlp output patterns:
 *   [download]  42.5% of 120.34MiB at 5.23MiB/s ETA 00:14
 *   [download] 100% of 120.34MiB in 00:23
 *
 * @param {string} line
 * @returns {{ percent: number, speed: string|null, eta: string|null }|null}
 */
function parseYtdlpProgress(line) {
  if (!line.includes('[download]')) return null;

  const percentMatch = line.match(/(\d+\.?\d*)%/);
  if (!percentMatch) return null;

  const percent = parseFloat(percentMatch[1]);
  if (isNaN(percent)) return null;

  const speedMatch = line.match(/at\s+([\d.]+\w+\/s)/);
  const etaMatch = line.match(/ETA\s+([\d:]+)/);

  return {
    percent: Math.min(percent, 100),
    speed: speedMatch ? speedMatch[1] : null,
    eta: etaMatch ? etaMatch[1] : null,
  };
}

/**
 * Map raw yt-dlp percentage to our 30-95 progress range
 * (0-30 is pre-download, 95-100 is post-processing).
 * @param {number} ytPercent - 0-100 from yt-dlp
 * @returns {number} 30-95 mapped progress
 */
function mapProgress(ytPercent) {
  return Math.round(30 + (ytPercent / 100) * 65);
}

/* ------------------------------------------------------------------ */
/*  Format resolution                                                 */
/* ------------------------------------------------------------------ */

/**
 * Build yt-dlp format and output template arguments.
 * @param {string} format  - 'video' or 'audio'
 * @param {string} quality - '1080', '720', '480', 'best'
 * @returns {{ formatArgs: string[], outputExt: string }}
 */
function buildYtdlpArgs(format, quality) {
  if (format === 'audio') {
    return {
      formatArgs: ['-f', 'bestaudio', '-x', '--audio-format', 'mp3', '--audio-quality', '0'],
      outputExt: 'mp3',
    };
  }

  const qMap = {
    '1080': 'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
    '720': 'bestvideo[height<=720]+bestaudio/best[height<=720]',
    '480': 'bestvideo[height<=480]+bestaudio/best[height<=480]',
    best: 'bestvideo+bestaudio/best',
  };

  return {
    formatArgs: ['-f', qMap[quality] || qMap.best, '--merge-output-format', 'mp4'],
    outputExt: 'mp4',
  };
}

/* ------------------------------------------------------------------ */
/*  Job processor                                                     */
/* ------------------------------------------------------------------ */

/**
 * Process a single BullMQ job.
 *
 * @param {import('bullmq').Job} job
 * @returns {Promise<object>} Job result
 */
async function processJob(job) {
  const { jobId, url, platform, format, quality, meta } = job.data;
  const attemptNumber = job.attemptsMade + 1;

  logger.info('[worker] Processing job', { jobId, platform, url, attempt: attemptNumber });

  try {
    /* ---- 1. Update status → processing ---- */
    await updateJob(jobId, { status: 'processing', startedAt: Date.now() });

    /* ---- 2. Publish 10% — Fetching media info ---- */
    await publishProgress(jobId, 10, 'Fetching media info...');
    await job.updateProgress(10);

    /* ---- 3. Extract URL ---- */
    const breaker = getBreaker(platform);
    let directUrl;

    try {
      directUrl = await breaker.fire(async () => {
        return extractUrl(url, { platform, format, quality });
      });
    } catch (extractErr) {
      // Try fresh extraction once
      logger.warn('[worker] Initial extraction failed, trying fresh', {
        jobId,
        error: extractErr.message,
      });
      directUrl = await extractFreshUrl(url, { platform, format, quality });
    }

    if (!directUrl) {
      throw new Error('URL extraction returned empty result');
    }

    /* ---- 4. Publish 30% — Preparing download ---- */
    await publishProgress(jobId, 30, 'Preparing download...');
    await job.updateProgress(30);

    /* ---- 5 / 6. Streaming vs download job ---- */
    let result;

    if (job.name === 'streaming-download' || job.data.streamingFallback) {
      // Streaming job: cache URL and return it
      try {
        const cacheKey = `stream:${platform}:${url}:${format}`;
        await cacheUrl(cacheKey, directUrl, URL_CACHE_TTL_S);
      } catch {
        // Non-fatal
      }

      result = {
        type: 'stream',
        directUrl,
        platform,
        format,
        quality,
        title: meta?.title || 'Unknown',
      };

      await publishProgress(jobId, 100, 'Download ready!');
      await job.updateProgress(100);
    } else {
      // Download job: spawn yt-dlp child process
      result = await downloadWithYtdlp(job, jobId, url, platform, format, quality, meta);
    }

    /* ---- 7-8. Complete ---- */
    await updateJob(jobId, {
      status: 'completed',
      result,
      completedAt: Date.now(),
    });

    logger.info('[worker] Job completed', { jobId, platform });
    return result;
  } catch (err) {
    return handleJobError(err, job, jobId, platform, attemptNumber);
  }
}

/**
 * Download media using yt-dlp child process with real-time progress.
 *
 * @param {import('bullmq').Job} job
 * @param {string} jobId
 * @param {string} url
 * @param {string} platform
 * @param {string} format
 * @param {string} quality
 * @param {object|null} meta
 * @returns {Promise<object>}
 */
function downloadWithYtdlp(job, jobId, url, platform, format, quality, meta) {
  return new Promise((resolve, reject) => {
    const { formatArgs, outputExt } = buildYtdlpArgs(format, quality);
    const outputPath = path.join(TMP_DIR, `vouxify-${jobId}.${outputExt}`);

    const args = [
      ...formatArgs,
      '--no-playlist', // Single item only in this path
      '--no-warnings',
      '--newline', // Force progress on new lines
      '--no-colors',
      '-o', outputPath,
      url,
    ];

    logger.info('[worker] Spawning yt-dlp', { jobId, args: args.join(' ') });

    const proc = spawn('yt-dlp', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: JOB_TIMEOUT_MS,
    });

    let stderrBuffer = '';
    let stdoutBuffer = '';
    let lastReportedPercent = 30;
    let killed = false;

    // Timeout watchdog
    const timeoutHandle = setTimeout(() => {
      killed = true;
      proc.kill('SIGTERM');
      setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch { /* already dead */ }
      }, 5_000);
      reject(new Error(`yt-dlp timed out after ${JOB_TIMEOUT_MS / 1000}s`));
    }, JOB_TIMEOUT_MS);

    // Parse stderr for progress
    proc.stderr.on('data', async (chunk) => {
      const text = chunk.toString();
      stderrBuffer += text;

      // Process each line
      const lines = text.split('\n');
      for (const line of lines) {
        const progress = parseYtdlpProgress(line);
        if (progress) {
          const mapped = mapProgress(progress.percent);
          // Only publish if progress increased by >= 2%
          if (mapped > lastReportedPercent + 1) {
            lastReportedPercent = mapped;
            const msg = progress.speed
              ? `Downloading... ${Math.round(progress.percent)}% (${progress.speed})`
              : `Downloading... ${Math.round(progress.percent)}%`;

            try {
              await publishProgress(jobId, mapped, msg);
              await job.updateProgress(mapped);
            } catch {
              // Non-critical — don't interrupt download
            }
          }
        }
      }
    });

    proc.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString();
    });

    proc.on('close', async (code) => {
      clearTimeout(timeoutHandle);

      if (killed) return; // Already rejected via timeout

      if (code !== 0) {
        const errMsg = stderrBuffer.slice(-500).trim() || `yt-dlp exited with code ${code}`;
        reject(new Error(`yt-dlp failed (code ${code}): ${errMsg}`));
        return;
      }

      // Verify output file exists
      try {
        const stat = fs.statSync(outputPath);
        if (stat.size === 0) {
          reject(new Error('yt-dlp produced empty output file'));
          return;
        }

        // Publish 95% → post-processing
        try {
          await publishProgress(jobId, 95, 'Finalizing...');
          await job.updateProgress(95);
        } catch { /* non-critical */ }

        // Publish 100% → done
        try {
          await publishProgress(jobId, 100, 'Download ready!');
          await job.updateProgress(100);
        } catch { /* non-critical */ }

        resolve({
          type: 'download',
          filePath: outputPath,
          fileSize: stat.size,
          format,
          quality,
          ext: outputExt,
          platform,
          title: meta?.title || 'Unknown',
        });
      } catch (statErr) {
        reject(new Error(`Output file not found: ${outputPath}`));
      }
    });

    proc.on('error', (spawnErr) => {
      clearTimeout(timeoutHandle);
      reject(new Error(`Failed to spawn yt-dlp: ${spawnErr.message}`));
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Error handling                                                    */
/* ------------------------------------------------------------------ */

/**
 * Handle job failure — classify, decide retry, update store.
 *
 * @param {Error} err
 * @param {import('bullmq').Job} job
 * @param {string} jobId
 * @param {string} platform
 * @param {number} attemptNumber
 * @throws {Error} Always rethrows so BullMQ can manage retries
 */
async function handleJobError(err, job, jobId, platform, attemptNumber) {
  const classified = classifyError(err, platform);
  const isFinalAttempt = attemptNumber >= MAX_ATTEMPTS;

  logger.error('[worker] Job failed', {
    jobId,
    platform,
    attempt: attemptNumber,
    isFinal: isFinalAttempt,
    code: classified.code,
    error: err.message,
  });

  if (classified.retryable && !isFinalAttempt) {
    // Silent retry — don't publish error yet
    await updateJob(jobId, {
      status: 'retrying',
      lastError: classified.code,
      attempt: attemptNumber,
    });

    // Rethrow so BullMQ retries with backoff
    throw err;
  }

  // Final failure — publish error to user
  const userMsg = getUserMessage(classified);

  await updateJob(jobId, {
    status: 'failed',
    error: userMsg,
    errorCode: classified.code,
    completedAt: Date.now(),
    attempt: attemptNumber,
  });

  await publishProgress(jobId, -1, userMsg);

  // Throw UnrecoverableError to prevent BullMQ retries
  const { UnrecoverableError } = require('bullmq');
  throw new UnrecoverableError(userMsg);
}

/* ------------------------------------------------------------------ */
/*  Worker lifecycle                                                  */
/* ------------------------------------------------------------------ */

/** @type {Worker[]} Active worker instances for shutdown */
const activeWorkers = [];

/** @type {boolean} Whether shutdown has been initiated */
let shuttingDown = false;

/**
 * Start BullMQ workers for all platform queues.
 *
 * Creates one Worker per platform with the configured concurrency.
 * Registers SIGTERM/SIGINT handlers for graceful shutdown.
 *
 * @returns {Worker[]} Array of active Worker instances
 */
function startWorker() {
  if (activeWorkers.length > 0) {
    logger.warn('[worker] Workers already running, skipping duplicate start');
    return activeWorkers;
  }

  const connection = getRedis();

  for (const platform of PLATFORMS) {
    const concurrency = CONCURRENCY[platform] || 2;
    const queueName = `vouxify:${platform}`;

    const worker = new Worker(
      queueName,
      processJob,
      {
        connection,
        concurrency,
        // Don't stall — we track our own timeouts
        lockDuration: JOB_TIMEOUT_MS + 30_000,
        lockRenewTime: Math.floor(JOB_TIMEOUT_MS / 2),
        // Prefix for all keys
        prefix: 'vouxify',
      }
    );

    // Event handlers
    worker.on('completed', (job) => {
      logger.info(`[worker:${platform}] Job completed`, { jobId: job?.data?.jobId });
    });

    worker.on('failed', (job, err) => {
      logger.error(`[worker:${platform}] Job failed`, {
        jobId: job?.data?.jobId,
        error: err.message,
      });
    });

    worker.on('error', (err) => {
      // Worker-level error (usually Redis connection)
      logger.error(`[worker:${platform}] Worker error`, { error: err.message });
    });

    worker.on('stalled', (jobId) => {
      logger.warn(`[worker:${platform}] Job stalled`, { jobId });
    });

    activeWorkers.push(worker);
    logger.info(`[worker] Started ${platform} worker`, { concurrency, queue: queueName });
  }

  // Register graceful shutdown handlers
  registerShutdownHandlers();

  logger.info('[worker] All workers started', {
    platforms: PLATFORMS,
    totalWorkers: activeWorkers.length,
  });

  return activeWorkers;
}

/**
 * Register process signal handlers for graceful shutdown.
 * Workers finish their current jobs before closing.
 */
function registerShutdownHandlers() {
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info(`[worker] Received ${signal}, starting graceful shutdown...`);

    const closePromises = activeWorkers.map(async (worker) => {
      try {
        await worker.close();
      } catch (err) {
        logger.error('[worker] Error closing worker', { error: err.message });
      }
    });

    try {
      // Give workers up to 30 seconds to finish current jobs
      await Promise.race([
        Promise.allSettled(closePromises),
        new Promise((resolve) => setTimeout(resolve, 30_000)),
      ]);
    } catch {
      // Swallow — we're shutting down
    }

    logger.info('[worker] All workers closed');

    // Clear the array
    activeWorkers.length = 0;
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

/**
 * Get current worker status for health checks.
 * @returns {{ running: boolean, workers: number, shuttingDown: boolean }}
 */
function getWorkerStatus() {
  return {
    running: activeWorkers.length > 0,
    workers: activeWorkers.length,
    shuttingDown,
  };
}

/* ------------------------------------------------------------------ */
/*  Exports                                                            */
/* ------------------------------------------------------------------ */

module.exports = { startWorker, getWorkerStatus };
