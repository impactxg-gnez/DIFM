import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

export async function POST(
    request: Request,
    props: { params: Promise<{ id: string }> }
) {
    const { id: visitId } = await props.params;

    try {
        const body = await request.json();
        const { decision } = body; // "APPROVE" or "REJECT"

        const cookieStore = await cookies();
        const userId = cookieStore.get('userId')?.value;
        const userRole = cookieStore.get('userRole')?.value;

        if (!userId || userRole !== 'CUSTOMER') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!decision || !['APPROVE', 'REJECT'].includes(decision)) {
            return NextResponse.json({ error: 'Invalid decision. Must be APPROVE or REJECT' }, { status: 400 });
        }

        const result = await prisma.$transaction(async (tx) => {
            const visit = await tx.visit.findUnique({
                where: { id: visitId },
                include: { job: true }
            });

            if (!visit) throw new Error('Visit not found');

            // Verify customer owns this job
            if (visit.job.customerId !== userId) {
                throw new Error('Not authorized for this visit');
            }

            // Verify parts are pending
            if (visit.partsStatus !== 'PENDING') {
                throw new Error('No pending parts approval for this visit');
            }

            const now = new Date();

            if (decision === 'APPROVE') {
                // Approve parts and resume timer
                const updatedVisit = await tx.visit.update({
                    where: { id: visitId },
                    data: {
                        partsStatus: 'APPROVED',
                        partsApprovedAt: now,
                    }
                });

                // Resume job timer
                await tx.job.update({
                    where: { id: visit.jobId },
                    data: {
                        timerPausedAt: null,
                        timerPausedForParts: false,
                    }
                });

                return { visit: updatedVisit, action: 'APPROVED' };

            } else {
                // Reject parts - keep timer paused, transition to issue state
                const updatedVisit = await tx.visit.update({
                    where: { id: visitId },
                    data: {
                        partsStatus: 'REJECTED',
                        partsRejectedAt: now,
                        status: 'ISSUE_PENDING',
                    }
                });

                // Keep timer paused
                return { visit: updatedVisit, action: 'REJECTED' };
            }
        });

        return NextResponse.json({ success: true, ...result });

    } catch (error: any) {
        console.error('Parts decision error', error);
        const message = error?.message || 'Internal Server Error';
        const statusCode = message.includes('authorized') || message.includes('pending') ? 400 : 500;
        return NextResponse.json({ error: message }, { status: statusCode });
    }
}
