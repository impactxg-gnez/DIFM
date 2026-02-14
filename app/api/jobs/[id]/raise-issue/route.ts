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
        const { reasonCode, evidencePhotos, description } = body;

        const cookieStore = await cookies();
        const userId = cookieStore.get('userId')?.value;
        const userRole = cookieStore.get('userRole')?.value;

        if (!userId || !userRole) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!reasonCode || !reasonCode.trim()) {
            return NextResponse.json({ error: 'Reason code is required' }, { status: 400 });
        }

        if (!evidencePhotos || !evidencePhotos.trim()) {
            return NextResponse.json({ error: 'Evidence photos are required' }, { status: 400 });
        }

        const result = await prisma.$transaction(async (tx) => {
            const job = await tx.job.findUnique({ where: { id } });
            if (!job) throw new Error('Job not found');

            const currentStatus = job.status as JobStatus;
            let newStatus: JobStatus;
            let issueRaisedBy: string;

            if (userRole === 'CUSTOMER') {
                // Customer can raise issue from COMPLETED
                if (job.customerId !== userId) {
                    throw new Error('Not authorized for this job');
                }

                if (currentStatus !== 'COMPLETED') {
                    throw new Error('Customers can only raise issues from COMPLETED status');
                }

                newStatus = 'ISSUE_RAISED_BY_CUSTOMER';
                issueRaisedBy = 'CUSTOMER';

            } else if (userRole === 'PROVIDER') {
                // Provider can raise issue from ARRIVING or IN_PROGRESS
                if (job.providerId !== userId) {
                    throw new Error('Not authorized for this job');
                }

                if (!['ARRIVING', 'IN_PROGRESS'].includes(currentStatus)) {
                    throw new Error('Providers can only raise issues from ARRIVING or IN_PROGRESS status');
                }

                newStatus = 'ISSUE_RAISED_BY_PROVIDER';
                issueRaisedBy = 'PROVIDER';

            } else {
                throw new Error('Invalid user role');
            }

            if (!canTransition(currentStatus, newStatus)) {
                throw new Error(`Invalid transition ${currentStatus} -> ${newStatus}`);
            }

            const now = new Date();

            const updatedJob = await tx.job.update({
                where: { id },
                data: {
                    status: newStatus,
                    statusUpdatedAt: now,
                    issueRaisedBy,
                    issueReasonCode: reasonCode,
                    issueEvidencePhotos: evidencePhotos,
                    issueRaisedAt: now,
                    disputeNotes: description || null,
                    // Freeze payout for customer issues
                    payoutFrozen: issueRaisedBy === 'CUSTOMER',
                    // Freeze timer for provider issues
                    timerFrozenForIssue: issueRaisedBy === 'PROVIDER',
                    timerPausedAt: issueRaisedBy === 'PROVIDER' ? now : job.timerPausedAt,
                }
            });

            await tx.jobStateChange.create({
                data: {
                    jobId: id,
                    fromStatus: currentStatus,
                    toStatus: newStatus,
                    reason: `Issue raised by ${issueRaisedBy.toLowerCase()}: ${reasonCode}`,
                    changedById: userId,
                    changedByRole: userRole,
                },
            });

            return updatedJob;
        });

        return NextResponse.json({ success: true, job: result });

    } catch (error: any) {
        console.error('Raise issue error', error);
        const message = error?.message || 'Internal Server Error';
        const statusCode = message.includes('Invalid transition') || message.includes('authorized') || message.includes('only raise') ? 400 : 500;
        return NextResponse.json({ error: message }, { status: statusCode });
    }
}
