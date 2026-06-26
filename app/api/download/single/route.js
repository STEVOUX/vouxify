import { NextResponse } from 'next/server';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { publishProgress, createJob, updateJob } from '@/lib/job-store';
import { sanitizeMetadata } from '@/lib/utils/sanitize';

const execFileAsync = promisify(execFile);

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CONCURRENCY = 6; // Download 6 tracks simultaneously

function getYtDlpPath() {
  const candidates = [
    path.join(process.cwd(), 'bin', 'yt-dlp.exe'),
    path.join(process.cwd(), 'yt-dlp.exe'),
    'yt-dlp',
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return 'yt-dlp';
}

/**
 * POST /api/download/single
 * Spotify single track or playlist — finds on YouTube and downloads as MP3
 */
export async function POST(req) {
  try {
    const body = await req.json();
    const { url, format = 'audio', quality = '192', selectedIndices = [], spotifyQueries = [], playlistTitle = null } = body;

    if (!url) return NextResponse.json({ error: 'URL is required' }, { status: 400 });

    const isSpotify = url.includes('spotify.com');
    const jobId = uuid();
    await createJob({ jobId, url, platform: isSpotify ? 'spotify' : 'youtube', format, quality, status: 'queued' });

    const isMulti = spotifyQueries && spotifyQueries.length > 0;
    const audioQualityKbps = ['320','256','192','128','96'].includes(quality) ? `${quality}K` : '128K';
    runSpotifyDownload(jobId, url, isSpotify, isMulti, spotifyQueries, audioQualityKbps, playlistTitle).catch(() => {});

    return NextResponse.json({ success: true, jobId });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

/**
 * Download a single track via yt-dlp and return the output file path.
 */
function downloadTrack(ytDlp, query, outPath, audioQualityKbps = '128K') {
  return new Promise((resolve, reject) => {
    const args = [
      '--no-warnings', '--no-check-certificates', '--newline', '--no-colors', '--no-playlist',
      '--js-runtimes', 'node',
      '--concurrent-fragments', '10',
      '--extractor-args', 'youtube:player_client=ios,web,default',
      '--ffmpeg-location', require('path').join(process.cwd(), 'bin'),
      '-f', 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
      '-x', '--audio-format', 'mp3', '--audio-quality', audioQualityKbps,
      '--no-embed-thumbnail', '--no-embed-metadata',
      '--default-search', 'ytsearch',
      '--socket-timeout', '10',
      '--retries', '2',
      '-o', outPath,
      query,
    ];

    const proc = spawn(ytDlp, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderrBuf = '';
    proc.stderr.on('data', c => { stderrBuf += c.toString(); });
    proc.on('close', code => {
      if (code !== 0) {
        reject(new Error(stderrBuf.split('\n').filter(Boolean).pop()?.slice(0, 150) || 'Track download failed'));
      } else {
        resolve();
      }
    });
    proc.on('error', reject);
  });
}

async function runSpotifyDownload(jobId, url, isSpotify, isMulti, spotifyQueries, audioQualityKbps = '128K', playlistTitle = null) {
  const ytDlp = getYtDlpPath();

  const outDir = path.join(os.tmpdir(), `vouxify_sp_${jobId}`);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  try {
    // ── Single track (not from playlist) ────────────────────────
    if (!isMulti) {
      let searchUrl = url;

      let songTitle = 'track';

      if (isSpotify) {
        // Try Spotify API first for exact name
        try {
          const token = await getSpotifyToken();
          const trackId = url.match(/track\/([a-zA-Z0-9]+)/)?.[1];
          if (trackId && token) {
            const trackRes = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (trackRes.ok) {
              const track = await trackRes.json();
              const artist = track.artists?.[0]?.name || '';
              const name = track.name || '';
              songTitle = sanitizeMetadata(name, 100);
              searchUrl = `ytsearch1:${artist} ${name} audio`;
              await publishProgress(jobId, 15, `Found: ${name} by ${artist}`);
            }
          }
        } catch {}

        // Fallback: use yt-dlp dump-json on the Spotify URL (but this may DRM fail)
        if (!searchUrl.startsWith('ytsearch')) {
          searchUrl = url;
        }
      }

      await publishProgress(jobId, 20, 'Downloading...');
      const outPath = path.join(outDir, `track-${jobId}.mp3`);
      await downloadTrack(ytDlp, searchUrl, outPath, audioQualityKbps);

      // Find the actual file (yt-dlp may vary extension)
      const files = fs.readdirSync(outDir).filter(f => !f.endsWith('.part'));
      if (files.length === 0) throw new Error('Download failed — file not found.');
      const finalPath = path.join(outDir, files[0]);
      const stat = fs.statSync(finalPath);
      const downloadName = `vouxify-${songTitle}.mp3`;

      await updateJob(jobId, { status: 'completed', result: { filePath: finalPath, fileSize: stat.size, format: 'audio', ext: 'mp3', downloadName } });
      await publishProgress(jobId, 100, 'Done!', { status: 'completed', result: `/api/job/${jobId}/download` });
      return;
    }

    // ── Playlist: parallel concurrent downloads ──────────────────
    const total = spotifyQueries.length;
    await publishProgress(jobId, 5, `Starting ${total} tracks (${CONCURRENCY} at a time)...`);

    let completed = 0;
    let failed = 0;
    const activeTitles = new Set();

    // Helper: run a single track download with progress reporting
    const runOne = async (query, idx) => {
      // Extract display title from ytsearch query
      const title = query.replace(/^ytsearch1?:/, '').replace(/ audio$/, '').trim();
      const shortTitle = title.length > 40 ? title.slice(0, 38) + '…' : title;
      activeTitles.add(shortTitle);

      const outPath = path.join(outDir, `${String(idx).padStart(3, '0')}-${jobId}.mp3`);

      try {
        await downloadTrack(ytDlp, query, outPath, audioQualityKbps);
        completed++;
      } catch {
        failed++;
      } finally {
        activeTitles.delete(shortTitle);
        const pct = Math.round(5 + (completed + failed) / total * 88);
        const current = [...activeTitles].slice(0, 2).join(', ') || shortTitle;
        await publishProgress(
          jobId, pct,
          `Downloading ${completed + failed}/${total} · ${current}`
        ).catch(() => {});
      }
    };

    // Concurrency pool: process queries in batches of CONCURRENCY
    for (let i = 0; i < spotifyQueries.length; i += CONCURRENCY) {
      const batch = spotifyQueries.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map((query, j) => runOne(query, i + j)));
    }

    await publishProgress(jobId, 94, `Compressing ${completed} tracks to ZIP...`);

    // Collect all downloaded files
    const files = fs.readdirSync(outDir)
      .filter(f => !f.endsWith('.part') && !f.endsWith('.ytdl') && !f.endsWith('.temp'))
      .sort();

    if (files.length === 0) throw new Error('No tracks were downloaded.');

    if (files.length === 1) {
      const finalPath = path.join(outDir, files[0]);
      const stat = fs.statSync(finalPath);
      await updateJob(jobId, { status: 'completed', result: { filePath: finalPath, fileSize: stat.size, format: 'audio', ext: 'mp3' } });
      await publishProgress(jobId, 100, 'Done!', { status: 'completed', result: `/api/job/${jobId}/download` });
      return;
    }

    // ZIP multiple files
    const archiver = (await import('archiver')).default;
    // Sanitize playlist title for filename
    const safeName = (playlistTitle || 'playlist')
      .replace(/[^a-zA-Z0-9\s_-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 60);
    const zipPath = path.join(os.tmpdir(), `vouxify-${safeName}.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 1 } }); // level 1 = fastest

    await new Promise((resolve, reject) => {
      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);
      archive.directory(outDir, false);
      archive.finalize();
    });

    await updateJob(jobId, { status: 'completed', result: { filePath: zipPath, format: 'audio', ext: 'zip' } });
    await publishProgress(jobId, 100, `Complete! ${completed} tracks downloaded.`, {
      status: 'completed', result: `/api/job/${jobId}/download`
    });

  } catch (err) {
    await updateJob(jobId, { status: 'failed', error: err.message });
    await publishProgress(jobId, -1, err.message, { status: 'failed', error: err.message });
  }
}

async function getSpotifyToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token || null;
}
