import { NextResponse } from 'next/server';
import { getJob, subscribeProgress } from '@/lib/job-store';

export const dynamic = 'force-dynamic';

/**
 * GET /api/job/[jobId]/stream
 * Server-Sent Events for real-time job progress.
 */
export async function GET(req, { params }) {
  const { jobId } = await params;

  if (!jobId) {
    return new NextResponse('Job ID required', { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };

      // Send initial state
      const existingJob = await getJob(jobId).catch(() => null);
      if (existingJob) {
        send({
          jobId,
          progress: existingJob.progress || 0,
          message: existingJob.progressMessage || 'Processing...',
          status: existingJob.status || 'queued',
          result: existingJob.status === 'completed' ? `/api/job/${jobId}/download` : null,
          error: existingJob.error,
        });

        // If already done, close immediately
        if (existingJob.status === 'completed' || existingJob.status === 'failed') {
          controller.close();
          return;
        }
      } else {
        send({ jobId, progress: 0, message: 'Queued...', status: 'queued' });
      }

      // Subscribe to progress events
      const unsubscribe = subscribeProgress(jobId, (payload) => {
        send(payload);
        if (payload.status === 'completed' || payload.status === 'failed') {
          try { controller.close(); } catch {}
          unsubscribe();
        }
      });

      // Keepalive ping every 15 seconds
      const pingInterval = setInterval(() => {
        try { controller.enqueue(encoder.encode(': ping\n\n')); } catch { clearInterval(pingInterval); }
      }, 15000);

      // Timeout after 10 minutes
      const timeoutHandle = setTimeout(() => {
        clearInterval(pingInterval);
        unsubscribe();
        send({ status: 'failed', error: 'Timeout', progress: -1 });
        try { controller.close(); } catch {}
      }, 600000);

      // Clean up on abort
      req.signal.addEventListener('abort', () => {
        clearInterval(pingInterval);
        clearTimeout(timeoutHandle);
        unsubscribe();
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    },
  });
}
