'use strict';

/**
 * lib/utils/ffmpeg.js — FFmpeg helpers using ffmpeg-static bundled binary.
 * On Vercel, ffmpeg-static provides the correct pre-compiled binary path.
 */

const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { sanitizeMetadata } = require('./sanitize');

// Resolve the actual physical path of ffmpeg (works around Next.js webpack __dirname bundling issue)
let resolvedFfmpegPath = ffmpegStatic;
if (!resolvedFfmpegPath || !fs.existsSync(resolvedFfmpegPath)) {
  const localPath = path.join(
    process.cwd(),
    'node_modules',
    'ffmpeg-static',
    process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  );
  if (fs.existsSync(localPath)) {
    resolvedFfmpegPath = localPath;
  }
}

// Point fluent-ffmpeg at the resolved binary