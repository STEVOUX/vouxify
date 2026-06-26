'use strict';

/**
 * @module auto-update
 * @description Keeps yt-dlp up to date by periodically running `yt-dlp -U`.
 * Extraction sites frequently change their APIs, so keeping yt-dlp current
 * is critical for reliability. Runs an update immediately on startup, then
 * every 6 hours. Never crashes the process if an update fails.
 */

const { execFile } = require('child_process');

/** @type {number} Update interval: 6 hours in ms */
const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** @type {number} Timeout for the update process: 120 seconds */
const UPDATE_TIMEOUT_MS = 120_000;

/** @type {NodeJS.Timeout|null} */
let intervalHandle = null;

/** @type {boolean} Whether an update is currently running */
let updateInProgress = false;

/** @type {string|null} Last update result for diagnostics */
let lastUpdateResult = null;

/** @type {number|null} Timestamp of last successful update */
let lastUpdateTime = null;

/**
 * Simple logger that uses console but could be swapped for a structured logger.
 * @param {'info'|'warn'|'error'} level
 * @param {string} message
 * @param {Object} [meta]
 */
function log(level, message, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    module: 'auto-update',
    level,
    message,
    ...meta,
  };

  if (level === 'error') {
    console.error(JSON.stringify(entry));
  } else if (level === 'warn') {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

/**
 * Run `yt-dlp -U` to update to the latest version.
 * Returns a promise that always resolves (never rejects) — errors are logged.
 *
 * @returns {Promise<{ success: boolean, output: string }>}
 */
function updateYtDlp() {
  if (updateInProgress) {
    log('warn', 'Update already in progress, skipping');
    return Promise.resolve({ success: false, output: 'Update already in progress' });
  }

  updateInProgress = true;

  return new Promise((resolve) => {
    log('info', 'Starting yt-dlp update');

    const ytDlpBin = process.env.YTDLP_PATH || 'yt-dlp';

    execFile(
      ytDlpBin,
      ['-U'],
      {
        timeout: UPDATE_TIMEOUT_MS,
        maxBuffer: 1024 * 1024, // 1MB
        env: { ...process.env },
      },
      (error, stdout, stderr) => {
        updateInProgress = false;

        const output = [stdout, stderr].filter(Boolean).join('\n').trim();

        if (error) {
          // Don't crash — just log
          const errMsg = error.killed
            ? 'Update timed out'
            : error.message || 'Unknown error';

          log('error', 'yt-dlp update failed', {
            error: errMsg,
            output: output.slice(0, 500), // Truncate for log safety
          });

          lastUpdateResult = `FAILED: ${errMsg}`;
          resolve({ success: false, output: errMsg });
          return;
        }

        // Check if output indicates success
        const isUpToDate =
          /already.*up.*to.*date/i.test(output) ||
          /is up to date/i.test(output);
        const isUpdated = /updated.*successfully/i.test(output) ||
          /updating to/i.test(output);

        if (isUpToDate) {
          log('info', 'yt-dlp is already up to date');
          lastUpdateResult = 'UP_TO_DATE';
        } else if (isUpdated) {
          log('info', 'yt-dlp updated successfully', {
            output: output.slice(0, 200),
          });
          lastUpdateResult = 'UPDATED';
        } else {
          log('info', 'yt-dlp update completed', {
            output: output.slice(0, 200),
          });
          lastUpdateResult = 'COMPLETED';
        }

        lastUpdateTime = Date.now();
        resolve({ success: true, output });
      }
    );
  });
}

/**
 * Start the auto-update schedule. Runs an update immediately,
 * then every 6 hours. Safe to call multiple times (idempotent).
 *
 * @returns {Promise<void>}
 */
async function startAutoUpdate() {
  // Stop any existing schedule
  stopAutoUpdate();

  // Run immediately (don't await — let it happen in background)
  updateYtDlp().catch(() => {
    // Already logged inside updateYtDlp, this catch is just for safety
  });

  // Schedule recurring updates
  intervalHandle = setInterval(() => {
    updateYtDlp().catch(() => {
      // Already logged inside updateYtDlp
    });
  }, UPDATE_INTERVAL_MS);

  // Don't keep the process alive just for updates
  if (intervalHandle && intervalHandle.unref) {
    intervalHandle.unref();
  }

  log('info', 'Auto-update schedule started', {
    intervalHours: UPDATE_INTERVAL_MS / (60 * 60 * 1000),
  });
}

/**
 * Stop the auto-update schedule.
 */
function stopAutoUpdate() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    log('info', 'Auto-update schedule stopped');
  }
}

/**
 * Get the current auto-update status for diagnostics.
 * @returns {{ lastResult: string|null, lastUpdateTime: number|null, updateInProgress: boolean, scheduled: boolean }}
 */
function getUpdateStatus() {
  return {
    lastResult: lastUpdateResult,
    lastUpdateTime,
    updateInProgress,
    scheduled: intervalHandle !== null,
  };
}

module.exports = {
  updateYtDlp,
  startAutoUpdate,
  stopAutoUpdate,
  getUpdateStatus,
};
