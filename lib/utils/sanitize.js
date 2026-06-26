'use strict';

/**
 * lib/utils/sanitize.js — Metadata string sanitiser for FFmpeg + filesystem safety.
 */

function sanitizeMetadata(str, maxLen = 200) {
  if (!str) return 'Unknown';
  return str
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/[<>:"\/\\|?*'`]/g, '')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .substring(0, maxLen)
    .trim() || 'Unknown';
}

function buildFilename(trackNumber, artist, title) {
  const n = String(trackNumber).padStart(2, '0');
  const t = sanitizeMetadata(title, 100);
  return `${n}-${t}.mp3`;
}

function sanitizeFolderName(name) {
  if (!name) return 'Playlist';
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/[<>:"\/\\|?*'`]/g, '')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .substring(0, 80)
    .trim() || 'Playlist';
}

module.exports = { sanitizeMetadata, buildFilename, sanitizeFolderName };
