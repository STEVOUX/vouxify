import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { publishProgress, createJob, updateJob } from '@/lib/job-store';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

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

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { url, format = 'video', selectedIndices = [] } = body;

  if (!url) return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  if (!url.includes('instagram.com')) {
    return NextResponse.json({ error: 'Invalid Instagram URL. Please paste a valid instagram.com link.' }, { status: 400 });
  }

  const jobId = uuid();
  await createJob({ jobId, url, platform: 'instagram', format, status: 'processing' });
  runInstagram(jobId, url, format, selectedIndices);
  return NextResponse.json({ success: true, jobId });
}

async function runInstagram(jobId, url, format, selectedIndices) {
  const ytDlp = getYtDlpPath();
  
  const isMulti = Array.isArray(selectedIndices) && selectedIndices.length > 0;
  
  let outDir, outputPath;
  if (isMulti) {
    outDir = path.join(os.tmpdir(), `vouxify_dir_${jobId}`);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    outputPath = path.join(outDir, `%(playlist_index)s_-_%(title)s.%(ext)s`);
  } else {
    outputPath = path.join(os.tmpdir(), `vouxify-%(title)s-${jobId}.%(ext)s`);
  }

  const args = [
    '--no-warnings', '--no-check-certificates', 
    isMulti ? '--yes-playlist' : '--no-playlist',
    '--newline', '--no-colors',
  ];

  if (isMulti) {
    args.push('--playlist-items', selectedIndices.join(','));
  }

  const igCookiesPath = path.join(process.cwd(), 'ig_cookies.txt');
  if (fs.existsSync(igCookiesPath)) {
    args.push('--cookies', igCookiesPath);
  } else {
    const igUser = process.env.INSTAGRAM_USERNAME;
    const igPass = process.env.INSTAGRAM_PASSWORD;
    if (igUser && igPass) args.push('--username', igUser, '--password', igPass);
  }

  if (format === 'audio') {
    args.push('-f', 'bestaudio/best', '-x', '--audio-format', 'mp3');
  }

  args.push('-o', outputPath, url);

  await publishProgress(jobId, 5, isMulti ? `Connecting... Preparing ${selectedIndices.length} items` : 'Connecting to Instagram...');
  return runSpawnJob(jobId, ytDlp, args, format, isMulti, outDir);
}

function runSpawnJob(jobId, bin, args, format, isMulti, outDir) {
  return new Promise((resolve) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderrBuf = '';
    let lastPct = 5;

    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      const m = text.match(/(\d+\.?\d*)%/);
      if (m) {
        const pct = Math.round(5 + parseFloat(m[1]) * 0.9);
        if (pct > lastPct) { lastPct = pct; publishProgress(jobId, pct, `Downloading... ${Math.round(parseFloat(m[1]))}%`).catch(() => {}); }
      }
    });
    proc.stderr.on('data', (c) => { stderrBuf += c.toString(); });
    proc.on('close', async (code) => {
      if (code !== 0) {
        const s = stderrBuf.toLowerCase();
        // Fallback for image posts or blocks
        if (s.includes('no video formats') || s.includes('empty media') || s.includes('not granting access') || s.includes('bad request')) {
          try {
            await publishProgress(jobId, 15, 'Fallback: Analyzing image carousel...');
            const { instagramGetUrl } = require('instagram-url-direct');
            const igData = await instagramGetUrl(args[args.length - 1]); // url is last arg
            if (igData && igData.url_list && igData.url_list.length > 0) {
              const urls = igData.url_list;
              const https = require('https');
              const destDir = isMulti ? outDir : path.dirname(outDir); 
              // outDir is actually the output path for single files in yt-dlp if !isMulti, but we passed outDir in runSpawnJob signature
              const actualOutDir = isMulti ? outDir : path.dirname(args[args.indexOf('-o') + 1]);
              
              for (let i = 0; i < urls.length; i++) {
                const fileUrl = urls[i];
                const ext = fileUrl.includes('.mp4') ? '.mp4' : '.jpg';
                const fName = isMulti ? `ig_part_${i+1}${ext}` : `vouxify_ig_${Date.now()}-${jobId}${ext}`;
                const filePath = path.join(actualOutDir, fName);
                
                await publishProgress(jobId, Math.round(15 + (80 * (i / urls.length))), `Downloading part ${i+1}/${urls.length}...`);
                await new Promise((res, rej) => {
                  https.get(fileUrl, (response) => {
                    if (response.statusCode !== 200) return rej(new Error('Failed download'));
                    const file = require('fs').createWriteStream(filePath);
                    response.pipe(file);
                    file.on('finish', () => { file.close(); res(); });
                  }).on('error', rej);
                });
              }
              // Resume ZIP logic below by artificially setting code = 0
              code = 0;
            } else {
              throw new Error('Empty fallback data');
            }
          } catch (fallbackErr) {
            console.error('IG Fallback failed:', fallbackErr);
            // Fallthrough to the standard error
          }
        }
        
        if (code !== 0) {
          let errMsg = 'Download failed.';
          if (s.includes('login') || s.includes('private')) errMsg = 'This post is private. Login credentials may be needed.';
          else if (s.includes('not found') || s.includes('unavailable')) errMsg = 'Post not found or unavailable.';
          else if (stderrBuf.trim()) errMsg = stderrBuf.split('\n').filter(Boolean).pop()?.slice(0, 120) || errMsg;
          await updateJob(jobId, { status: 'failed', error: errMsg });
          await publishProgress(jobId, -1, errMsg, { status: 'failed', error: errMsg });
          return resolve();
        }
      }
      if (isMulti && outDir && fs.existsSync(outDir)) {
        const files = fs.readdirSync(outDir).filter(f => !f.endsWith('.part') && !f.endsWith('.ytdl'));
        if (files.length === 0) {
          const errMsg = 'No files downloaded.';
          await updateJob(jobId, { status: 'failed', error: errMsg });
          await publishProgress(jobId, -1, errMsg, { status: 'failed', error: errMsg });
          return resolve();
        }
        
        if (files.length === 1) {
          const singleFile = path.join(outDir, files[0]);
          await updateJob(jobId, { status: 'completed', result: { filePath: singleFile, format } });
          await publishProgress(jobId, 100, 'Complete!', { status: 'completed', result: `/api/job/${jobId}/download` });
          return resolve();
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
            resolve();
          });
          
          archive.on('error', async (err) => {
            await updateJob(jobId, { status: 'failed', error: 'Compression failed' });
            await publishProgress(jobId, -1, 'Compression failed', { status: 'failed' });
            resolve();
          });
          
          archive.pipe(output);
          archive.directory(outDir, false);
          await archive.finalize();
          return;
        } catch (err) {
          const errMsg = 'Failed to create ZIP';
          await updateJob(jobId, { status: 'failed', error: errMsg });
          await publishProgress(jobId, -1, errMsg, { status: 'failed', error: errMsg });
          return resolve();
        }
      }

      const tmpDir = os.tmpdir();
      const files = fs.readdirSync(tmpDir).filter(f => f.includes(jobId) && !f.endsWith('.part') && !f.endsWith('.ytdl'));
      if (files.length === 0) {
        const errMsg = 'Download completed but file not found.';
        await updateJob(jobId, { status: 'failed', error: errMsg });
        await publishProgress(jobId, -1, errMsg, { status: 'failed', error: errMsg });
        return resolve();
      }
      const finalFile = path.join(tmpDir, files[0]);
      await updateJob(jobId, { status: 'completed', result: { filePath: finalFile, format } });
      await publishProgress(jobId, 100, 'Complete!', { status: 'completed', result: `/api/job/${jobId}/download` });
      resolve();
    });
    proc.on('error', async (e) => { await publishProgress(jobId, -1, e.message, { status: 'failed' }); resolve(); });
  });
}
