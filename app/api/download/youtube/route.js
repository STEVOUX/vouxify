import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { publishProgress, createJob, updateJob } from '@/lib/job-store';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function getYtDlpPath() {
  const candidates = [
    path.join(process.cwd(), 'bin', 'yt-dlp.exe'),
    path.join(process.cwd(), 'yt-dlp.exe'),
    path.join(process.cwd(), 'bin', 'yt-dlp'),
    'yt-dlp',
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return 'yt-dlp';
}

function buildFormatString(format, quality) {
  if (format === 'audio') {
    return 'bestaudio/best';
  }
  
  // If quality is a format ID (e.g., '137+140' or '136'), pass it directly
  if (quality && quality.includes('+')) {
      return quality; // It already contains video+audio format IDs
  }
  if (quality && !isNaN(parseInt(quality))) {
      return `${quality}+bestaudio/best`; // It's just a video ID, append best audio
  }
  
  const qMap = {
    '4k':   'bestvideo[height<=2160]+bestaudio/best[height<=2160]',
    '1080': 'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
    '720':  'bestvideo[height<=720]+bestaudio/best[height<=720]',
    '480':  'bestvideo[height<=480]+bestaudio/best[height<=480]',
    'best': 'bestvideo+bestaudio/best',
  };
  return qMap[quality] || qMap.best;
}

function getYtDlpArgs(format, quality) {
  const args = [
    '--no-warnings',
    '--no-check-certificates',
    '--newline',
    '--no-colors',
    '--js-runtimes', 'node',
    '--concurrent-fragments', '10',
    '--extractor-args', 'youtube:player_client=ios,web,default',
    '--ffmpeg-location', require('path').join(process.cwd(), 'bin')
  ];

  // Auth — username/password logic removed to avoid bot blocks
  // Format
  args.push('-f', buildFormatString(format, quality));

  if (format === 'audio') {
    const kbps = ['320', '256', '192', '128'].includes(quality) ? `${quality}K` : '0';
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', kbps);
  }

  return args;
}

/**
 * POST /api/download/youtube
 * Immediately starts download, streams progress via SSE job system.
 */
export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { url, format = 'video', quality = 'best', selectedIndices = [] } = body;

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  // Basic URL validation
  if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
    return NextResponse.json({ error: 'Invalid YouTube URL. Please paste a valid youtube.com or youtu.be link.' }, { status: 400 });
  }

  const jobId = uuid();
  const ext = format === 'audio' ? 'mp3' : 'mp4';
  
  const isMulti = Array.isArray(selectedIndices) && selectedIndices.length > 0;
  
  let outDir, outputPath;
  if (isMulti) {
    outDir = path.join(os.tmpdir(), `vouxify_yt_${jobId}`);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    outputPath = path.join(outDir, `%(playlist_index)s_-_%(title)s.%(ext)s`);
  } else {
    outputPath = path.join(os.tmpdir(), `vouxify-%(title)s-${jobId}.%(ext)s`);
  }

  await createJob({ jobId, url, platform: 'youtube', format, quality, status: 'processing' });

  runYouTubeDownload(jobId, url, format, quality, ext, outputPath, isMulti, selectedIndices, outDir);

  return NextResponse.json({ success: true, jobId });
}

async function runYouTubeDownload(jobId, url, format, quality, ext, outputPath, isMulti, selectedIndices, outDir) {
  const ytDlp = getYtDlpPath();
  const args = getYtDlpArgs(format, quality);

  args.push(isMulti ? '--yes-playlist' : '--no-playlist');
  if (isMulti) args.push('--playlist-items', selectedIndices.join(','));
  
  if (format === 'video' && quality === 'best' && !args.includes('--merge-output-format')) {
    args.push('--merge-output-format', 'mp4');
  }

  args.push('-o', outputPath, url);

  await publishProgress(jobId, 5, isMulti ? `Preparing ${selectedIndices.length} items...` : 'Connecting to YouTube...');

  return new Promise((resolve) => {
    const proc = spawn(ytDlp, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderrBuf = '';
    let lastPct = 5;

    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      const m = text.match(/(\d+\.?\d*)%/);
      if (m) {
        const parsedPct = parseFloat(m[1]);
        const pct = Math.round(5 + parsedPct * 0.9);
        
        // Reset lastPct if we drop significantly (meaning the second file, e.g. audio, has started downloading)
        if (pct < lastPct - 20) {
          lastPct = 0;
        }

        if (pct >= lastPct) {
          lastPct = pct;
          const speedM = text.match(/at\s+([\d.]+\w+\/s)/);
          const etaM   = text.match(/ETA\s+([\d:]+)/);
          
          let msg = `Downloading... ${Math.round(parsedPct)}%`;
          if (speedM && speedM[1] && !speedM[1].includes('0.00') && !speedM[1].includes('Unknown')) {
            msg += ` at ${speedM[1]}${etaM ? ` — ETA ${etaM[1]}` : ''}`;
          }
          
          publishProgress(jobId, pct, msg).catch(() => {});
        }
      } else if (text.includes('Merging formats')) {
        publishProgress(jobId, 95, 'Merging audio and video (this takes a few seconds)...').catch(() => {});
      }
    });

    proc.stderr.on('data', (c) => { stderrBuf += c.toString(); });

    proc.on('close', async (code) => {
      if (code !== 0) {
        let errMsg = 'Download failed.';
        const s = stderrBuf.toLowerCase();
        if (s.includes('private')) errMsg = 'This video is private.';
        else if (s.includes('not available')) errMsg = 'This video is not available.';
        else if (s.includes('age') || s.includes('sign in')) errMsg = 'Age-restricted video — sign-in required.';
        else if (s.includes('copyright') || s.includes('removed')) errMsg = 'This video has been removed or blocked.';
        else if (s.includes('no such format')) errMsg = 'Requested quality/format is not available for this video.';
        else if (stderrBuf.trim()) errMsg = stderrBuf.split('\n').filter(Boolean).pop()?.slice(0, 120) || errMsg;

        await updateJob(jobId, { status: 'failed', error: errMsg });
        await publishProgress(jobId, -1, errMsg, { status: 'failed', error: errMsg });
        return resolve();
      }

      // Find the actual output file (yt-dlp may use different ext)
      if (isMulti && outDir && fs.existsSync(outDir)) {
        const files = fs.readdirSync(outDir).filter(f => !f.endsWith('.part') && !f.endsWith('.ytdl'));
        if (files.length === 0) {
          const errMsg = 'No files downloaded.';
          await updateJob(jobId, { status: 'failed', error: errMsg });
          await publishProgress(jobId, -1, errMsg, { status: 'failed', error: errMsg });
          return;
        }
        
        if (files.length === 1) {
          const singleFile = path.join(outDir, files[0]);
          await updateJob(jobId, { status: 'completed', result: { filePath: singleFile, format } });
          await publishProgress(jobId, 100, 'Complete!', { status: 'completed', result: `/api/job/${jobId}/download` });
          return;
        }
        
        await publishProgress(jobId, 95, 'Compressing to ZIP archive...');
        try {
          const archiver = (await import('archiver')).default;
          const zipPath = path.join(os.tmpdir(), `vouxify-collection-${jobId}.zip`);
          const output = fs.createWriteStream(zipPath);
          const archive = archiver('zip', { zlib: { level: 9 } });
          
          output.on('close', async () => {
            await updateJob(jobId, { status: 'completed', result: { filePath: zipPath, format, ext: 'zip' } });
            await publishProgress(jobId, 100, 'Complete!', { status: 'completed', result: `/api/job/${jobId}/download` });
          });
          
          archive.on('error', async (err) => {
            await updateJob(jobId, { status: 'failed', error: 'Compression failed' });
            await publishProgress(jobId, -1, 'Compression failed', { status: 'failed' });
          });
          
          archive.pipe(output);
          archive.directory(outDir, false);
          await archive.finalize();
          return;
        } catch (err) {
          const errMsg = 'Failed to create ZIP';
          await updateJob(jobId, { status: 'failed', error: errMsg });
          await publishProgress(jobId, -1, errMsg, { status: 'failed', error: errMsg });
          return;
        }
      }

      // Single file fallback logic
      const tmpDir = os.tmpdir();
      const files = fs.readdirSync(tmpDir).filter(f => f.includes(jobId) && !f.endsWith('.part') && !f.endsWith('.ytdl'));
      if (files.length === 0) {
        const errMsg = 'Download completed but file not found.';
        await updateJob(jobId, { status: 'failed', error: errMsg });
        await publishProgress(jobId, -1, errMsg, { status: 'failed', error: errMsg });
        return;
      }

      const finalFile = path.join(tmpDir, files[0]);
      await updateJob(jobId, { status: 'completed', result: { filePath: finalFile, format, ext } });
      await publishProgress(jobId, 100, 'Download complete!', { status: 'completed', result: `/api/job/${jobId}/download` });
      resolve();
    });

    proc.on('error', async (spawnErr) => {
      await publishProgress(jobId, -1, `Failed to start yt-dlp: ${spawnErr.message}`, { status: 'failed' });
      resolve();
    });
  });
}
