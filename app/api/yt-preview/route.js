import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execFileAsync = promisify(execFile);

function getYtDlpPath() {
  const binPath = path.join(process.cwd(), 'bin', 'yt-dlp.exe');
  if (fs.existsSync(binPath)) return binPath;
  const rootPath = path.join(process.cwd(), 'yt-dlp.exe');
  if (fs.existsSync(rootPath)) return rootPath;
  return 'yt-dlp';
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'URL required' }, { status: 400 });
  }

  try {
    const ytDlp = getYtDlpPath();
    const args = ['--dump-json', '--no-playlist', '--no-warnings', url];

    const { stdout } = await execFileAsync(ytDlp, args, { timeout: 15000 });
    const data = JSON.parse(stdout.trim());

    return NextResponse.json({
      title: data.title || 'Unknown',
      uploader: data.uploader || data.channel || '',
      duration: data.duration || 0,
      duration_string: data.duration_string || '',
      thumbnail: data.thumbnail || '',
      view_count: data.view_count || 0,
      platform: data.extractor || 'unknown',
    });
  } catch (err) {
    return NextResponse.json({ error: 'Preview unavailable' }, { status: 500 });
  }
}
