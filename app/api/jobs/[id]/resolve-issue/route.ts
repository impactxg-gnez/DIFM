import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { canTransition, JobStatus } from '@/lib/jobStateMachine';
import { cookies } from 'next/headers';

export async function POST(
    request: Request,
    props: { params: Promise<{ id: string }> }
) {
    const { id } = await props.params;

    try {
        const body = await request.json();
        const { resolution, unfreezeTimer, unfreezePayout } = body;

        const cookieStore = await cookies();
        const userId = cookieStore.get('userId')?.value;
        const userRole = cookieStore.get('userRole')?.value;

        // Admin-only endpoint
        if (!userId || userRole !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
        }

        if (!resolution || !resolution.trim()) {
            return NextResponse.json({ error: 'Resolution notes are required' }, { status: 400 });
        }

        const result = await prisma.$transaction(async (tx) => {
            const job = await tx.job.findUnique({ where: { id } });
            if (!job) throw new Error('Job not found');

            const currentStatus = job.status as JobStatus;

            if (!['ISSUE_RAISED_BY_CUSTOMER', 'ISSUE_RAISED_BY_PROVIDER'].includes(currentStatus)) {
                throw new Error('Job must be in ISSUE_RAISED_* status to resolve');
            }

            const newStatus: JobStatus = 'RESOLUTION_PENDING';

            if (!canTransition(currentStatus, newStatus)) {
                throw new Error(`Invalid transition ${currentStatus} -> ${newStatus}`);
            }

            const now = new Date();

            const updatedJob = await tx.job.update({
                where: { id },
                data: {
                    status: newStatus,
                    statusUpdatedAt: now,
                    issueResolution: resolution,
                    issueResolvedAt: now,
                    // Unfreeze based on admin decision
                    timerFrozenForIssue: unfreezeTimer ? false : job.timerFrozenForIssue,
                    timerPausedAt: unfreezeTimer ? null : job.timerPausedAt,
                    payoutFrozen: unfreezePayout ? false : job.payoutFrozen,
                }
            });

            await tx.jobStateChange.create({
                data: {
                    jobId: id,
                    fromStatus: currentStatus,
                    toStatus: newStatus,
                    reason: `Admin resolved issue: ${resolution}`,
                    changedById: userId,
                    changedByRole: userRole,
                },
            });

            return updatedJob;
        });

        return NextResponse.json({ success: true, job: result });

    } catch (error: any) {
        console.error('Resolve issue error', error);
        const message = error?.message || 'Internal Server Error';
        const statusCode = message.includes('Invalid transition') || message.includes('must be') ? 400 : 500;
        return NextResponse.json({ error: message }, { status: statusCode });
    }
}
