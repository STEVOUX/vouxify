'use strict';

/**
 * lib/error-classifier.js
 */

const ERROR_TYPES = {
  private_video:  { code: 'PRIVATE_VIDEO',  retryable: false, msg: 'This video is private.' },
  not_available:  { code: 'NOT_AVAILABLE',  retryable: false, msg: 'This media is not available.' },
  rate_limit:     { code: 'RATE_LIMIT',     retryable: true,  msg: 'Rate limited. Retrying...' },
  geo_blocked:    { code: 'GEO_BLOCKED',    retryable: false, msg: 'This content is not available in your region.' },
  timeout:        { code: 'TIMEOUT',        retryable: true,  msg: 'Request timed out. Retrying...' },
  unknown:        { code: 'UNKNOWN',        retryable: true,  msg: 'An unexpected error occurred.' },
};

function classifyError(err, platform) {
  const msg = (err?.message || '').toLowerCase();
  const stderr = (err?.stderr || '').toLowerCase();
  const combined = msg + stderr;

  if (combined.includes('private') || combined.includes('sign in')) return { ...ERROR_TYPES.private_video, type: 'private_video' };
  if (combined.includes('not available') || combined.includes('deleted') || combined.includes('unavailable')) return { ...ERROR_TYPES.not_available, type: 'not_available' };
  if (combined.includes('rate') || combined.includes('429') || combined.includes('too many')) return { ...ERROR_TYPES.rate_limit, type: 'rate_limit' };
  if (combined.includes('geo') || combined.includes('blocked') || combined.includes('country')) return { ...ERROR_TYPES.geo_blocked, type: 'geo_blocked' };
  if (combined.includes('timeout') || combined.includes('timed out')) return { ...ERROR_TYPES.timeout, type: 'timeout' };
  return { ...ERROR_TYPES.unknown, type: 'unknown' };
}

function getUserMessage(classified) {
  return classified?.msg || 'An error occurred. Please try again.';
}

module.exports = { classifyError, getUserMessage };
