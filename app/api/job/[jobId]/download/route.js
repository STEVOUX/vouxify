import { NextResponse } from 'next/server';
import { getJob } from '@/lib/job-store';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

/**
 * GET /api/job/[jobId]/download
 * Returns the downloaded file for completed jobs.
 */
export async function GET(req, { params }) {
  const { jobId } = await params;

  try {
    const job = await getJob(jobId);

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.status !== 'completed' || !job.result?.filePath) {
      return NextResponse.json({ error: 'File not ready' }, { status: 400 });
    }

    const filePath = job.result.filePath;

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'File expired or not found' }, { status: 404 });
    }

    const stat = fs.statSync(filePath);
    const ext = job.result.ext || path.extname(filePath).slice(1) || 'mp4';
    const mimeTypes = {
      mp4: 'video/mp4',
      mp3: 'audio/mpeg',
      webm: 'video/webm',
      m4a: 'audio/mp4',
    };

    const fileStream = fs.createReadStream(filePath);
    const nodeStream = new ReadableStream({
      start(controller) {
        fileStream.on('data', (chunk) => controller.enqueue(chunk));
        fileStream.on('end', () => controller.close());
        fileStream.on('error', (err) => controller.error(err));
      },
    });

    let safeName = job.result.downloadName || path.basename(filePath).replace(/"/g, '');
    if (!job.result.downloadName) {
      safeName = safeName.replace(`-${jobId}`, '');
    }
    
    const encodedName = encodeURIComponent(safeName);
    const asciiName = safeName.replace(/[^\x20-\x7E]/g, '');

    return new NextResponse(nodeStream, {
      headers: {
        'Content-Type': mimeTypes[ext] || 'application/octet-stream',
        'Content-Length': String(stat.size),
        'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
