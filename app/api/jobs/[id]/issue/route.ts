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
        const { issueNotes, issuePhotos } = body;

        const cookieStore = await cookies();
        const userId = cookieStore.get('userId')?.value;
        const userRole = cookieStore.get('userRole')?.value;

        if (!userId || userRole !== 'CUSTOMER') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!issueNotes || issueNotes.trim() === '') {
            return NextResponse.json({ error: 'Issue description is required' }, { status: 400 });
        }

        const result = await prisma.$transaction(async (tx) => {
            const job = await tx.job.findUnique({ where: { id } });
            if (!job) throw new Error('Job not found');

            // Verify customer owns this job
            if (job.customerId !== userId) {
                throw new Error('Not authorized for this job');
            }

            const currentStatus = job.status as JobStatus;

            // Only allow issue reporting from COMPLETED status
            if (currentStatus !== 'COMPLETED') {
                throw new Error(`Cannot report issue from status ${currentStatus}. Job must be COMPLETED.`);
            }

            if (!canTransition(currentStatus, 'ISSUE_REPORTED')) {
                throw new Error(`Invalid transition ${currentStatus} -> ISSUE_REPORTED`);
            }

            const now = new Date();

            const updatedJob = await tx.job.update({
                where: { id },
                data: {
                    status: 'ISSUE_REPORTED',
                    statusUpdatedAt: now,
                    disputeReason: issueNotes,
                    disputePhotos: issuePhotos || null,
                    disputedAt: now,
                }
            });

            await tx.jobStateChange.create({
                data: {
                    jobId: id,
                    fromStatus: currentStatus,
                    toStatus: 'ISSUE_REPORTED',
                    reason: 'Customer reported issue',
                    changedById: userId,
                    changedByRole: userRole,
                },
            });

            return updatedJob;
        });

        return NextResponse.json({ success: true, job: result });

    } catch (error: any) {
        console.error('Report issue error', error);
        const message = error?.message || 'Internal Server Error';
        const statusCode = message.includes('Invalid transition') || message.includes('authorized') ? 400 : 500;
        return NextResponse.json({ error: message }, { status: statusCode });
    }
}
