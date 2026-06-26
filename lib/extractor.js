'use strict';

/**
 * lib/extractor.js — yt-dlp wrapper for URL extraction & metadata.
 */

const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

const execFileAsync = promisify(execFile);

/* ── yt-dlp binary ───────────────────────────────────────────── */
function getYtDlpPath() {
  const candidates = [
    path.join(process.cwd(), 'bin', 'yt-dlp'),
    path.join(process.cwd(), 'bin', 'yt-dlp.exe'),
    path.join(process.cwd(), 'yt-dlp.exe'),
    path.join(process.cwd(), 'yt-dlp'),
    'yt-dlp',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return 'yt-dlp';
}

const YT_DLP = getYtDlpPath();

/* ── Common args ─────────────────────────────────────────────── */
function baseArgs() {
  const args = ['--no-warnings', '--no-check-certificates', '--no-playlist'];

  // YouTube: use cookies from browser to bypass bot check
  const cookieBrowser = process.env.YT_DLP_COOKIES_FROM_BROWSER;
  if (cookieBrowser && cookieBrowser !== 'none') {
    args.push('--cookies-from-browser', cookieBrowser);
  }

  // YouTube username/password (fallback)
  if (process.env.YOUTUBE_USERNAME && process.env.YOUTUBE_PASSWORD) {
    args.push('--username', process.env.YOUTUBE_USERNAME, '--password', process.env.YOUTUBE_PASSWORD);
  }

  return args;
}

function igArgs() {
  const args = ['--no-warnings', '--no-check-certificates', '--no-playlist'];
  if (process.env.INSTAGRAM_USERNAME && process.env.INSTAGRAM_PASSWORD) {
    args.push('--username', process.env.INSTAGRAM_USERNAME, '--password', process.env.INSTAGRAM_PASSWORD);
  }
  return args;
}

/* ── Format string builder ───────────────────────────────────── */
function buildFormat(format, quality) {
  if (format === 'audio') {
    return 'bestaudio/best';
  }
  const qMap = {
    '1080': 'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
    '720':  'bestvideo[height<=720]+bestaudio/best[height<=720]',
    '480':  'bestvideo[height<=480]+bestaudio/best[height<=480]',
    'best': 'bestvideo+bestaudio/best',
  };
  return qMap[quality] || qMap.best;
}

/* ── Extract direct URL ──────────────────────────────────────── */
async function extractUrl(url, { platform = 'youtube', format = 'video', quality = 'best' } = {}) {
  const isIg = platform === 'instagram';
  const args = [
    ...(isIg ? igArgs() : baseArgs()),
    '-f', buildFormat(format, quality),
    '--get-url',
    url,
  ];

  const { stdout } = await execFileAsync(YT_DLP, args, { timeout: 30000 });
  const directUrl = stdout.trim().split('\n')[0];
  if (!directUrl || !directUrl.startsWith('http')) {
    throw new Error('Could not extract direct URL');
  }
  return directUrl;
}

/* ── Extract fresh URL (force re-fetch) ─────────────────────── */
async function extractFreshUrl(url, opts = {}) {
  return extractUrl(url, opts);
}

/* ── Get metadata ────────────────────────────────────────────── */
async function getMetadata(url, { platform = 'youtube' } = {}) {
  const isIg = platform === 'instagram';
  const args = [
    ...(isIg ? igArgs() : baseArgs()),
    '--dump-json',
    url,
  ];

  const { stdout } = await execFileAsync(YT_DLP, args, { timeout: 20000 });

  // May be multiple JSON lines (playlist) — take first
  const firstLine = stdout.trim().split('\n').find(l => l.startsWith('{'));
  if (!firstLine) throw new Error('No metadata returned');

  return JSON.parse(firstLine);
}

/* ── Extract Spotify track (search YouTube) ──────────────────── */
async function extractSpotifyTrack(title, artist) {
  const query = `ytsearch1:${artist} ${title} audio`;
  const args = [
    ...baseArgs(),
    '--dump-json',
    '--no-playlist',
    '-f', 'bestaudio/best',
    query,
  ];

  const { stdout } = await execFileAsync(YT_DLP, args, { timeout: 30000 });
  const firstLine = stdout.trim().split('\n').find(l => l.startsWith('{'));
  if (!firstLine) throw new Error('No YouTube match found for Spotify track');
  return JSON.parse(firstLine);
}

/* ── Download to file ────────────────────────────────────────── */
function downloadToFile(url, outputPath, { platform = 'youtube', format = 'audio', quality = 'best' } = {}, onProgress) {
  return new Promise((resolve, reject) => {
    const isIg = platform === 'instagram';
    const formatStr = buildFormat(format, quality);

    const args = [
      ...(isIg ? igArgs() : baseArgs()),
      '-f', formatStr,
      '--no-playlist',
      '--newline',
      '--no-colors',
      '-o', outputPath,
      url,
    ];

    if (format === 'audio') {
      args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
    } else {
      args.push('--merge-output-format', 'mp4');
    }

    const proc = spawn(YT_DLP, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderrBuf = '';

    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderrBuf += text;
      if (onProgress) {
        const m = text.match(/(\d+\.?\d*)%/);
        if (m) onProgress(parseFloat(m[1]));
      }
    });

    proc.stdout.on('data', () => {});

    proc.on('close', (code) => {
      if (code === 0) resolve(outputPath);
      else reject(new Error(`yt-dlp exited ${code}: ${stderrBuf.slice(-300)}`));
    });

    proc.on('error', reject);
  });
}

module.exports = { extractUrl, extractFreshUrl, getMetadata, extractSpotifyTrack, downloadToFile, getYtDlpPath };