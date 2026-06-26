import { NextResponse } from 'next/server';
import { getJob } from '@/lib/job-store';
import fs from 'fs';

export const dynamic = 'force-dynamic';

/**
 * GET /api/job/[jobId]
 * Returns the current job status.
 */
export async function GET(req, { params }) {
  const { jobId } = await params;

  try {
    const job = await getJob(jobId);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Check if file still exists for completed jobs
    let fileExists = false;
    if (job.status === 'completed' && job.result?.filePath) {
      fileExists = fs.existsSync(job.result.filePath);
    }

    return NextResponse.json({
      jobId: job.jobId,
      status: job.status,
      progress: job.progress || 0,
      message: job.progressMessage || '',
      error: job.error,
      result: job.status === 'completed' ? `/api/job/${jobId}/download` : null,
      fileExists,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
