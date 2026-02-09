import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { dispatchJob } from '@/lib/dispatch/matcher';

/**
 * Admin endpoint to manually trigger dispatch for a job
 * Useful for debugging or manually dispatching jobs that are stuck in ASSIGNING
 */
export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const adminId = cookieStore.get('userId')?.value;
    const role = cookieStore.get('userRole')?.value;

    if (role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { id: jobId } = await props.params;

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { visits: true } as any
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.status !== 'ASSIGNING') {
      return NextResponse.json({ 
        error: `Job is not in ASSIGNING status. Current status: ${job.status}` 
      }, { status: 400 });
    }

    console.log(`[Admin Dispatch] Manually triggering broadcast dispatch for job ${jobId}`);
    const eligibleProviders = await dispatchJob(jobId);

    if (eligibleProviders && eligibleProviders.length > 0) {
      return NextResponse.json({ 
        success: true, 
        message: `Job broadcast to ${eligibleProviders.length} providers`,
        eligibleProviders 
      });
    } else {
      return NextResponse.json({ 
        success: false, 
        message: 'No eligible providers found for this job',
        job: {
          id: job.id,
          category: job.category,
          requiredCapability: (job as any).requiredCapability,
          status: job.status
        }
      });
    }
  } catch (error) {
    console.error('[Admin Dispatch] Error:', error);
    return NextResponse.json({ 
      error: 'Internal Server Error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

