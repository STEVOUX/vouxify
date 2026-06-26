'use strict';

/**
 * lib/downloader.js — yt-dlp wrapper for Vercel/Next.js environment.
 *
 * Key differences from Express version:
 * - Uses the bundled bin/yt-dlp binary (copied to /tmp on first use)
 * - All temp files go to os.tmpdir() (/tmp on Vercel)
 * - No DOWNLOADS_DIR constant — caller decides where to save
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { convertToMp3, embedMetadata, embedArtwork, ffmpegPath } = require('./utils/ffmpeg');
const { sanitizeMetadata, buildFilename } = require('./utils/sanitize');

const TIMEOUT_MS = parseInt(process.env.DOWNLOAD_TIMEOUT_MS, 10) || 240000;
const TMP_DIR = os.tmpdir();

// Path to the bundled yt-dlp binary (relative to project root)
const IS_WIN = process.platform === 'win32';
const BINARY_NAME = IS_WIN ? 'yt-dlp.exe' : 'yt-dlp';
const BUNDLED_BIN = path.join(process.cwd(), 'bin', BINARY_NAME);
const TMP_BIN = path.join(TMP_DIR, BINARY_NAME);

/**
 * Ensure yt-dlp binary is executable and available in /tmp.
 * Vercel serverless functions can write to /tmp but not to the bundle dir.
 */
function ensureBinary() {
  // Already set up
  if (fs.existsSync(TMP_BIN)) return TMP_BIN;

  // Try bundled binary
  if (fs.existsSync(BUNDLED_BIN)) {
    fs.copyFileSync(BUNDLED_BIN, TMP_BIN);
    if (!IS_WIN) fs.chmodSync(TMP_BIN, 0o755);
    return TMP_BIN;
  }

  // Fallback: try system yt-dlp
  return 'yt-dlp';
}

// Search query builder — cross-platform fallback chain
function buildSearchQueries(title, artist) {
  const t = sanitizeMetadata(title, 100);
  const a = sanitizeMetadata(artist, 60);
  return [
    { prefix: 'ytsearch1:',  query: `"${t}" "${a}"` },                // Standard YouTube search
    { prefix: 'scsearch1:',  query: `${t} ${a}` },                    // SoundCloud (NO IP BLOCKING!)
    { prefix: 'ytsearch1:',  query: `"${t}" "${a}" topic audio` },    // Standard YouTube topic/audio
    { prefix: 'scsearch1:',  query: `${t} ${a} official` },           // SoundCloud fallback
    { prefix: 'ytsearch1:',  query: `${t} ${a}` },                    // Standard YouTube last resort
  ];
}

function runYtDlp(ytdlpBin, args, signal) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    const nodeDir = path.dirname(process.execPath);
    if (process.platform === 'win32') {
      env.Path = `${nodeDir};${env.Path || ''}`;
    } else {
      env.PATH = `${nodeDir}:${env.PATH || ''}`;
    }

    const proc = spawn(ytdlpBin, args, { 
      stdio: ['ignore', 'pipe', 'pipe'],
      env
    });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`yt-dlp timeout after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);

    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        proc.kill('SIGKILL');
        reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      }, { once: true });
    }

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const errMsg = stderr || stdout || `yt-dlp exited with code ${code}`;
        if (errMsg.includes('HTTP Error 429')) reject(Object.assign(new Error(errMsg), { code: 'RATE_LIMIT' }));
        else reject(new Error(errMsg));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      if (err.code === 'ENOENT') {
        reject(new Error('yt-dlp binary not found. Run npm install to download it.'));
      } else {
        reject(err);
      }
    });
  });
}

/**
 * Download a single track from YouTube, convert to MP3, embed metadata.
 * Returns the path to the final MP3 file in /tmp.
 */
async function downloadTrack(metadata, quality = 192, includeArtwork = true, onProgress = () => {}, signal) {
  const ytdlpBin = ensureBinary();
  const queries = buildSearchQueries(metadata.title, metadata.artist);

  let lastError;

  for (let qi = 0; qi < queries.length; qi++) {
    const tmpId = `${Date.now()}_${Math.random().toString(36).slice(2)}_${qi}`;
    const rawPath = path.join(TMP_DIR, `vouxify_raw_${tmpId}.%(ext)s`);
    const { prefix, query } = queries[qi];
    onProgress(5, `Searching: query ${qi + 1}/${queries.length} (${prefix.replace('1:', '')})…`, null);

    const proxyList = process.env.PROXY_LIST ? process.env.PROXY_LIST.split(',') : [];
    const proxy = proxyList.length > 0 ? proxyList[Math.floor(Math.random() * proxyList.length)].trim() : null;

    const ytdlpArgs = [
      `${prefix}${query}`,
      '--format', 'bestaudio/best',
      '--no-playlist',
      '--no-warnings',
      '--match-filter', 'duration > 90 & duration < 700 & !is_live',
      '--output', rawPath,
      '--extractor-args', 'youtube:player_client=ios,android,web',
      '--socket-timeout', '30',
      '--retries', '2',
      '--fragment-retries', '2',
      '--no-part',
    ];

    if (proxy) {
      ytdlpArgs.push('--proxy', proxy);
    }

    // 1. If cookies.txt exists in the project root, use it (works around browser locks)
    const localCookiesPath = path.join(process.cwd(), 'cookies.txt');
    console.log(`\n[Downloader Debug] localCookiesPath: ${localCookiesPath}`);
    console.log(`[Downloader Debug] File exists check: ${fs.existsSync(localCookiesPath)}`);
    
    if (fs.existsSync(localCookiesPath)) {
      ytdlpArgs.push('--cookies', localCookiesPath);
    }
    // 2. Otherwise use the configured browser cookies (or default to chrome locally)
    else if (process.env.YT_DLP_COOKIES_FROM_BROWSER && process.env.YT_DLP_COOKIES_FROM_BROWSER !== 'none') {
      ytdlpArgs.push('--cookies-from-browser', process.env.YT_DLP_COOKIES_FROM_BROWSER);
    } else if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
      ytdlpArgs.push('--cookies-from-browser', 'chrome');
    }

    // Force yt-dlp to use the local Node.js engine to solve YouTube signature/n-challenge JS scripts
    ytdlpArgs.push('--js-runtimes', 'node');

    // Tell yt-dlp where the static ffmpeg executable is located for post-processing and extraction
    ytdlpArgs.push('--ffmpeg-location', ffmpegPath);
    
    console.log(`[Downloader Debug] Final ytdlpArgs:`, ytdlpArgs, `\n`);

    try {
      onProgress(10, 'Fetching audio from YouTube…', null);
      await runYtDlp(ytdlpBin, ytdlpArgs, signal);

      // Find the downloaded file
      const files = fs.readdirSync(TMP_DIR).filter(f => f.startsWith(`vouxify_raw_${tmpId}`));
      if (!files.length) throw new Error('yt-dlp produced no output file');

      const downloadedPath = path.join(TMP_DIR, files[0]);
      onProgress(45, 'Converting to MP3…', null);

      const finalPath = path.join(TMP_DIR, `vouxify_${tmpId}.mp3`);
      await convertToMp3(downloadedPath, finalPath, quality);
      fs.unlink(downloadedPath, () => {});

      onProgress(70, 'Embedding metadata…', null);
      await embedMetadata(finalPath, {
        title:       metadata.title,
        artist:      metadata.artist,
        album:       metadata.album,
        trackNumber: metadata.trackNumber,
        year:        metadata.year,
      });

      if (includeArtwork && metadata.artworkUrl) {
        onProgress(85, 'Embedding artwork…', null);
        await embedArtwork(finalPath, metadata.artworkUrl);
      }

      onProgress(100, 'Complete', null);
      return finalPath;

    } catch (err) {
      lastError = err;

      // Clean up partial files from this query attempt to prevent HTTP 416 range errors
      try {
        const filesToClean = fs.readdirSync(TMP_DIR).filter(f => f.startsWith(`vouxify_raw_${tmpId}`));
        for (const file of filesToClean) {
          fs.unlinkSync(path.join(TMP_DIR, file));
        }
      } catch (_) {}

      if (err.name === 'AbortError') throw err;
      if (err.code === 'RATE_LIMIT') throw err;
      console.warn(`[DL] Query ${qi + 1} failed for "${metadata.title}": ${err.message}`);
    }
  }

  throw lastError || new Error(`No YouTube match found for "${metadata.title}" by "${metadata.artist}"`);
}

async function downloadWithRetry(metadata, quality, includeArtwork, onProgress, onRetry, signal, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await downloadTrack(metadata, quality, includeArtwork, onProgress, signal);
    } catch (err) {
      if (err.name === 'AbortError') throw err;

      const isRateLimit = err.code === 'RATE_LIMIT' || err.message?.includes('429');
      const isNetwork   = err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.message?.includes('Connection');

      if ((isRateLimit || isNetwork) && attempt < retries) {
        const delay = Math.pow(2, attempt) * 1000;
        onRetry(attempt, retries, delay);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

module.exports = { downloadTrack, downloadWithRetry };
