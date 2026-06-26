'use strict';

/**
 * lib/streaming-engine.js — Zero-disk media streaming via fetch proxy.
 */

const { extractUrl, extractFreshUrl } = require('./extractor');
const logger = require('./logger');

const STREAM_TIMEOUT = 45000;

async function streamMedia(url, platform, { format = 'video', quality = 'best' } = {}) {
  let directUrl;
  let attempts = 0;
  const maxAttempts = 2;

  while (attempts < maxAttempts) {
    try {
      directUrl = attempts === 0
        ? await extractUrl(url, { platform, format, quality })
        : await extractFreshUrl(url, { platform, format, quality });
      break;
    } catch (err) {
      attempts++;
      if (attempts >= maxAttempts) throw err;
      logger.warn('[streaming-engine] Extraction failed, retrying', { attempt: attempts, error: err.message });
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STREAM_TIMEOUT);

  try {
    const response = await fetch(directUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.youtube.com/' },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      if (response.status === 403 && attempts < 1) {
        // Re-extract and try again
        directUrl = await extractFreshUrl(url, { platform, format, quality });
        const resp2 = await fetch(directUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.youtube.com/' },
        });
        if (!resp2.ok) throw new Error(`Upstream returned ${resp2.status}`);
        return buildResult(resp2, directUrl, format);
      }
      throw new Error(`Upstream returned ${response.status}`);
    }

    return buildResult(response, directUrl, format);
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

function buildResult(response, url, format) {
  const ct = response.headers.get('content-type') || (format === 'audio' ? 'audio/mpeg' : 'video/mp4');
  const cl = response.headers.get('content-length');
  const ext = format === 'audio' ? 'mp3' : 'mp4';

  return {
    stream: response.body,
    headers: {
      'Content-Type': ct,
      ...(cl ? { 'Content-Length': cl } : {}),
      'Content-Disposition': `attachment; filename="vouxify-download.${ext}"`,
    },
  };
}

module.exports = { streamMedia };
