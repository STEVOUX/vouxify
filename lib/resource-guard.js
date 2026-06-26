'use strict';

/**
 * lib/resource-guard.js — URL and request validation.
 */

const ALLOWED_DOMAINS = [
  'youtube.com', 'youtu.be', 'spotify.com', 'open.spotify.com',
  'instagram.com', 'tiktok.com', 'twitter.com', 'x.com',
];

function isAllowedUrl(url) {
  try {
    const u = new URL(url);
    return ALLOWED_DOMAINS.some(d => u.hostname === d || u.hostname.endsWith(`.${d}`));
  } catch { return false; }
}

async function validateRequest(url, platform, opts) {
  if (!url) return { valid: false, reason: 'URL is required.' };
  if (!isAllowedUrl(url)) return { valid: false, reason: 'URL domain not supported.' };
  return { valid: true };
}

async function validateMedia(meta) {
  if (!meta) return { valid: true };
  if (meta.duration && meta.duration > 7200) {
    return { valid: false, reason: 'Media exceeds 2-hour limit.' };
  }
  return { valid: true };
}

module.exports = { validateRequest, validateMedia };
