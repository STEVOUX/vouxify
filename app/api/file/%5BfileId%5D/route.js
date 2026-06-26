import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * GET /api/file/[fileId]
 * Serves a downloaded MP3 or ZIP from /tmp.
 * The file must have been written there by a download route in the same
 * warm function instance (typically within seconds of this request).
 */
export async function GET(request, { params }) {
  const { fileId } = params;

  // Security: only allow UUID-format IDs
  if (!/^[0-9a-f-]{36}$/.test(fileId)) {
    return new Response(JSON.stringify({ error: 'Invalid file ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const tmpDir = os.tmpdir();

  const { searchParams } = new URL(request.url);

  for (const ext of ['mp3', 'zip', 'mp4']) {
    const filePath = path.join(tmpDir, `${fileId}.${ext}`);
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      const stream = fs.createReadStream(filePath);

      // Convert Node.js stream to Web ReadableStream
      const webStream = new ReadableStream({
        start(controller) {
          stream.on('data', chunk => controller.enqueue(chunk));
          stream.on('end', () => controller.close());
          stream.on('error', err => controller.error(err));
        },
        cancel() {
          stream.destroy();
        },
      });

      const requestedFilename = searchParams.get('filename') || `${fileId}.${ext}`;
      const encodedFilename = encodeURIComponent(requestedFilename);

      return new Response(webStream, {
        headers: {
          'Content-Type': ext === 'zip' ? 'application/zip' : (ext === 'mp4' ? 'video/mp4' : 'audio/mpeg'),
          'Content-Length': String(stat.size),
          'Content-Disposition': `attachment; filename*=UTF-8''${encodedFilename}`,
          'Cache-Control': 'no-store',
        },
      });
    }
  }

  return new Response(JSON.stringify({ error: 'File not found or expired. Please download again.' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}
