/**
 * scripts/download-yt-dlp.js
 * Postinstall script: downloads the yt-dlp binary for the current platform.
 * Runs automatically after `npm install`.
 */

'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

const BIN_DIR = path.join(__dirname, '..', 'bin');
const IS_WIN = process.platform === 'win32';
const BINARY_NAME = IS_WIN ? 'yt-dlp.exe' : 'yt-dlp';
const BINARY_PATH = path.join(BIN_DIR, BINARY_NAME);

// Latest yt-dlp release URL
const BASE_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/';
let targetAsset = 'yt-dlp_linux'; // Vercel and generic Linux
if (process.platform === 'win32') targetAsset = 'yt-dlp.exe';
if (process.platform === 'darwin') targetAsset = 'yt-dlp_macos';

const DOWNLOAD_URL = BASE_URL + targetAsset;

function downloadFile(url, dest, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) return reject(new Error('Too many redirects'));

    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadFile(res.headers.location, dest, redirectCount + 1)
          .then(resolve)
          .catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} downloading yt-dlp`));
      }

      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
      file.on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    }).on('error', reject);
  });
}

async function main() {
  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }

  if (fs.existsSync(BINARY_PATH)) {
    const stat = fs.statSync(BINARY_PATH);
    if (stat.size > 1024 * 1024) { // > 1MB means it's a real binary
      console.log('[postinstall] yt-dlp already present, skipping download.');
      return;
    }
  }

  console.log(`[postinstall] Downloading yt-dlp for ${process.platform}…`);
  try {
    await downloadFile(DOWNLOAD_URL, BINARY_PATH);
    if (!IS_WIN) {
      fs.chmodSync(BINARY_PATH, 0o755);
    }
    const size = (fs.statSync(BINARY_PATH).size / 1024 / 1024).toFixed(1);
    console.log(`[postinstall] yt-dlp downloaded successfully (${size} MB)`);
  } catch (err) {
    console.warn(`[postinstall] Warning: Could not download yt-dlp: ${err.message}`);
    console.warn('[postinstall] Downloads will fail until yt-dlp is available.');
  }
}

main();
