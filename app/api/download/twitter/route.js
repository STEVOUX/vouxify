import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { publishProgress, createJob, updateJob } from '@/lib/job-store';

const execFileAsync = promisify(execFile);

export const dynamic = 'force-dynamic';

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

export async function POST(req) {
  try {
    const body = await req.json();
    const { url, format = 'video' } = body;

    if (!url) return NextResponse.json({ error: 'URL is required' }, { status: 400 });

    const jobId = uuid();
    await createJob({ jobId, url, platform: 'twitter', format, status: 'queued' });
    runTwitterDownload(jobId, url, format).catch(() => {});

    return NextResponse.json({ success: true, jobId });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

async function runTwitterDownload(jobId, url, format) {
  const ytDlp = getYtDlpPath();
  const ext = format === 'audio' ? 'mp3' : 'mp4';
  const outputPath = path.join(os.tmpdir(), `vouxify-%(title)s-${jobId}.%(ext)s`);

  try {
    await publishProgress(jobId, 15, 'Fetching tweet media...');
    const args = ['--no-warnings', '--no-playlist', '-o', outputPath, url];
    if (format === 'audio') args.push('-x', '--audio-format', 'mp3');

    await publishProgress(jobId, 40, 'Downloading...');
    await execFileAsync(ytDlp, args, { timeout: 60000 });
    await publishProgress(jobId, 95, 'Finalizing...');

    const tmpDir = os.tmpdir();
    const files = fs.readdirSync(tmpDir).filter(f => 
      f.startsWith('vouxify-') && 
      f.includes(jobId) && 
      !f.endsWith('.part') && 
      !f.endsWith('.ytdl')
    );
    const actualFile = files[0] ? path.join(tmpDir, files[0]) : null;

    if (!actualFile || !fs.existsSync(actualFile)) throw new Error('Output file missing');

    const stat = fs.statSync(actualFile);
    await updateJob(jobId, { status: 'completed', result: { filePath: actualFile, fileSize: stat.size, format, ext, jobId } });
    await publishProgress(jobId, 100, 'Done!', { status: 'completed', result: `/api/job/${jobId}/download` });
  } catch (err) {
    await updateJob(jobId, { status: 'failed', error: err.message });
    await publishProgress(jobId, -1, err.message, { status: 'failed', error: err.message });
  }
}
