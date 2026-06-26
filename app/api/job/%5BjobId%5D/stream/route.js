import { NextResponse } from 'next/server';
import { getSubscriber } from '@/lib/redis';
import { getJob } from '@/lib/job-store';

export const dynamic = 'force-dynamic';

/**
 * GET /api/job/[jobId]/stream
 * 
 * Server-Sent Events (SSE) endpoint for real-time progress updates.
 * Subscribes to Redis Pub/Sub for job progress events.
 */
export async function GET(req, { params }) {
  const { jobId } = params;

  if (!jobId) {
    return new NextResponse('Job ID required', { status: 400 });
  }

  // Quick check if job exists/is already finished
  try {
    const job = await getJob(jobId);
    if (!job) {
      return new NextResponse('Job not found', { status: 404 });
    }
  } catch (err) {
    // Ignore error, Redis might be down
  }

  const subscriber = getSubscriber();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const channel = `job-progress:${jobId}`;
      
      const sendEvent = (data) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch (err) {
          // Stream might be closed
        }
      };

      // Subscribe to Redis Pub/Sub
      try {
        if (subscriber) {
          await subscriber.subscribe(channel);
          subscriber.on('message', (ch, message) => {
            if (ch === channel) {
              try {
                const data = JSON.parse(message);
                sendEvent(data);
                
                // If completed or failed, close the connection
                if (data.status === 'completed' || data.status === 'failed') {
                  cleanup();
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
          });
        } else {
          // Fallback if Redis is not available: Poll the job-store manually
          let interval = setInterval(async () => {
            const job = await getJob(jobId);
            if (job) {
              sendEvent({
                jobId: job.jobId,
                progress: job.progress || 0,
                message: job.progressMessage || '',
                status: job.status,
                result: job.result,
                error: job.error
              });
              if (job.status === 'completed' || job.status === 'failed') {
                cleanup();
              }
            }
          }, 2000);
          
          req.signal.addEventListener('abort', () => clearInterval(interval));
        }
      } catch (err) {
        // Error subscribing
      }

      // Initial state
      sendEvent({ message: 'Connecting...', progress: 0, status: 'queued' });

      // Cleanup function
      const cleanup = () => {
        if (subscriber) {
          try {
            subscriber.unsubscribe(channel);
            subscriber.removeListener('message', () => {});
          } catch (e) {}
        }
        try {