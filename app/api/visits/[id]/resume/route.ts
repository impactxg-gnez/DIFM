import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { applyStatusChange } from '@/lib/jobStateMachine';

export async function POST(
    request: Request,
    props: { params: Promise<{ id: string }> }
) {
    const { id: visitId } = await props.params;

    try {
        const cookieStore = await cookies();
        const userId = cookieStore.get('userId')?.value;
        const userRole = cookieStore.get('userRole')?.value;

        if (!userId || userRole !== 'PROVIDER') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const result = await prisma.$transaction(async (tx) => {
            const visit = await tx.visit.findUnique({
                where: { id: visitId },
                include: { job: true }
            });

            if (!visit) throw new Error('Visit not found');

            // Verify provider is assigned to this job
            if (visit.job.providerId !== userId) {
                throw new Error('Not authorized for this visit');
            }

            // Verify parts are approved
            if (visit.partsStatus !== 'APPROVED') {
                throw new Error('Parts must be APPROVED before resuming work');
            }

            // Verify job is in PARTS_PENDING_APPROVAL
            if (visit.job.status !== 'PARTS_PENDING_APPROVAL') {
                throw new Error('Job is not in parts approval state');
            }

            // Resume job timer
            await tx.job.update({
                where: { id: visit.jobId },
                data: {
                    timerPausedAt: null,
                    timerPausedForParts: false,
                }
            });

            // Transition job state back to IN_PROGRESS
            return await applyStatusChange(visit.jobId, 'IN_PROGRESS', {
                tx,
                reason: 'Provider resumed work after parts approval',
                changedById: userId,
                changedByRole: 'PROVIDER'
            } as any);
        });

        return NextResponse.json({ success: true, job: result });

    } catch (error: any) {
        console.error('Resume error', error);
        const message = error?.message || 'Internal Server Error';
        const statusCode = message.includes('authorized') || message.includes('must be APPROVED') ? 400 : 500;
        return NextResponse.json({ error: message }, { status: statusCode });
    }
}
