import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applyStatusChange } from '@/lib/jobStateMachine';
import { cookies } from 'next/headers';

/**
 * Step 7: Payments & Finance - Pre-authorization
 * Moves job from ASSIGNED to PREAUTHORISED
 */
export async function POST(
    request: Request,
    props: { params: Promise<{ id: string }> }
) {
    const { id: jobId } = await props.params;

    try {
        const cookieStore = await cookies();
        const userId = cookieStore.get('userId')?.value;
        const userRole = cookieStore.get('userRole')?.value;

        // In a real system, this might be triggered by a background job or a specific user action
        if (!userId || (userRole !== 'ADMIN' && userRole !== 'CUSTOMER')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const job = await prisma.job.findUnique({ where: { id: jobId } });

        if (!job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        if (job.status !== 'ASSIGNED') {
            return NextResponse.json({ error: `Cannot pre-authorize from ${job.status}` }, { status: 400 });
        }

        // Simulate successful pre-auth
        // In reality, call Stripe/Payment Gateway here

        const updatedJob = await applyStatusChange(jobId, 'PREAUTHORISED', {
            reason: 'Card pre-authorized successfully',
            changedById: userId,
            changedByRole: userRole
        });

        return NextResponse.json({ success: true, job: updatedJob });

    } catch (error: any) {
        console.error('Pre-auth error', error);
        return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
    }
}
