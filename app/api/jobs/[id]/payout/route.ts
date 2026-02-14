import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applyStatusChange } from '@/lib/jobStateMachine';
import { cookies } from 'next/headers';

/**
 * Step 7: Payments & Finance - Payout
 * Moves job from CAPTURED to PAID_OUT
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

        // Payout is typically an ADMIN action
        if (!userId || userRole !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const job = await prisma.job.findUnique({ where: { id: jobId } });

        if (!job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        if (job.status !== 'CAPTURED') {
            return NextResponse.json({ error: `Cannot payout from ${job.status}` }, { status: 400 });
        }

        // Rule: No payout if issue is raised
        const issueStates = ['ISSUE_RAISED_BY_CUSTOMER', 'ISSUE_RAISED_BY_PROVIDER', 'RESOLUTION_PENDING'];
        if (issueStates.includes(job.status)) {
            return NextResponse.json({ error: 'Cannot payout while an issue is active.' }, { status: 400 });
        }

        // Simulate payout processing

        const updatedJob = await prisma.$transaction(async (tx) => {
            // Update transactions to COMPLETED
            await tx.transaction.updateMany({
                where: {
                    jobId,
                    type: 'PAYOUT',
                    status: 'PENDING'
                },
                data: { status: 'COMPLETED' }
            });

            // Apply status change
            return await applyStatusChange(jobId, 'PAID_OUT', {
                reason: 'Payout processed to provider',
                changedById: userId,
                changedByRole: 'ADMIN'
            });
        });

        return NextResponse.json({ success: true, job: updatedJob });

    } catch (error: any) {
        console.error('Payout error', error);
        return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
    }
}
