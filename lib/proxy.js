'use strict';

/**
 * @module proxy
 * @description Proxy rotation manager for yt-dlp extraction.
 * Reads a comma-separated PROXY_LIST from process.env, provides round-robin
 * proxy selection with health tracking. Failed proxies are automatically
 * skipped for a cooldown period, then re-introduced. All methods are safe
 * no-ops when no proxies are configured.
 */

/** @type {number} How long a failed proxy is sidelined (ms) */
const FAILURE_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

/** @type {number} Max consecutive failures before cooldown */
const MAX_FAILURES = 3;

/**
 * @typedef {Object} ProxyEntry
 * @property {string} url - The proxy URL
 * @property {number} failures - Consecutive failure count
 * @property {number|null} failedAt - Timestamp of last failure (null if healthy)
 */

/** @type {ProxyEntry[]} */
let proxies = [];

/** @type {number} Current round-robin index */
let currentIndex = 0;

/** @type {boolean} Whether the module has been initialized */
let initialized = false;

/**
 * Initialize the proxy list from the PROXY_LIST environment variable.
 * Called lazily on first access. Safe to call multiple times.
 */
function init() {
  if (initialized) return;
  initialized = true;

  const raw = process.env.PROXY_LIST || '';
  const urls = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  proxies = urls.map((url) => ({
    url,
    failures: 0,
    failedAt: null,
  }));

  currentIndex = 0;
}

/**
 * Check if a proxy entry is currently healthy (not in cooldown).
 * A proxy recovers automatically after FAILURE_COOLDOWN_MS.
 *
 * @param {ProxyEntry} entry
 * @returns {boolean}
 */
function isHealthy(entry) {
  if (entry.failures < MAX_FAILURES) return true;
  if (!entry.failedAt) return true;

  // Check if cooldown has elapsed
  const elapsed = Date.now() - entry.failedAt;
  if (elapsed >= FAILURE_COOLDOWN_MS) {
    // Auto-recover: reset failure state
    entry.failures = 0;
    entry.failedAt = null;
    return true;
  }

  return false;
}

/**
 * Whether proxy rotation is enabled (at least one proxy is configured).
 * @returns {boolean}
 */
function isEnabled() {
  init();
  return proxies.length > 0;
}

/**
 * Get the number of currently healthy (non-cooldown) proxies.
 * @returns {number}
 */
function getHealthyCount() {
  init();
  return proxies.filter(isHealthy).length;
}

/**
 * Get the next healthy proxy URL using round-robin selection.
 * Skips proxies that are currently in cooldown.
 *
 * @returns {string|null} Proxy URL, or null if none available
 */
function getProxy() {
  init();
  if (proxies.length === 0) return null;

  // Try each proxy once in round-robin order
  const total = proxies.length;
  for (let i = 0; i < total; i++) {
    const idx = (currentIndex + i) % total;
    const entry = proxies[idx];

    if (isHealthy(entry)) {
      currentIndex = (idx + 1) % total;
      return entry.url;
    }
  }

  // All proxies are in cooldown — return the least-recently-failed one
  // This is a last resort so extraction can still attempt with a proxy
  let bestEntry = proxies[0];
  for (const entry of proxies) {
    if (
      entry.failedAt &&
      bestEntry.failedAt &&
      entry.failedAt < bestEntry.failedAt
    ) {
      bestEntry = entry;
    }
  }

  return bestEntry ? bestEntry.url : null;
}

/**
 * Mark a proxy as failed. After MAX_FAILURES consecutive failures,
 * the proxy enters a 5-minute cooldown.
 *
 * @param {string} proxyUrl - The proxy URL to mark as failed
 */
function markFailed(proxyUrl) {
  init();
  if (!proxyUrl) return;

  const entry = proxies.find((p) => p.url === proxyUrl);
  if (!entry) return;

  entry.failures++;
  if (entry.failures >= MAX_FAILURES) {
    entry.failedAt = Date.now();
  }
}

/**
 * Mark a proxy as successful. Resets its failure count and cooldown.
 *
 * @param {string} proxyUrl - The proxy URL to mark as successful
 */
function markSuccess(proxyUrl) {
  init();
  if (!proxyUrl) return;

  const entry = proxies.find((p) => p.url === proxyUrl);
  if (!entry) return;

  entry.failures = 0;
  entry.failedAt = null;
}

/**
 * Get yt-dlp command-line arguments for proxy usage.
 * Returns ['--proxy', url] if a healthy proxy is available, or [].
 *
 * @returns {string[]} Array of yt-dlp proxy arguments
 */
function getProxyArgs() {
  const url = getProxy();
  if (!url) return [];
  return ['--proxy', url];
}

/**
 * Get yt-dlp proxy args for a specific proxy URL.
 * Useful when retrying with a specific proxy.
 *
 * @param {string|null} proxyUrl - Specific proxy URL to use
 * @returns {string[]} Array of yt-dlp proxy arguments
 */
function getProxyArgsFor(proxyUrl) {
  if (!proxyUrl) return [];
  return ['--proxy', proxyUrl];
}

/**
 * Get all proxy entries with their health status (for diagnostics).
 * @returns {Array<{ url: string, healthy: boolean, failures: number }>}
 */
function getStatus() {
  init();
  return proxies.map((entry) => ({
    url: entry.url,
    healthy: isHealthy(entry),
    failures: entry.failures,
  }));
}

/**
 * Reset all proxy state. Primarily for testing.
 */
function _reset() {
  proxies = [];
  currentIndex = 0;
  initialized = false;
}

module.exports = {
  isEnabled,
  getProxy,
  markFailed,
  markSuccess,
  getProxyArgs,
  getProxyArgsFor,
  getHealthyCount,
  getStatus,
  _reset,
};
