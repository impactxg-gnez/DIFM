import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applyStatusChange, JobStatus } from '@/lib/jobStateMachine';
import { cookies } from 'next/headers';

/**
 * ISSUE RAISING SYSTEM
 * COMPLETED → ISSUE_RAISED_BY_CUSTOMER
 * ARRIVING / IN_PROGRESS → ISSUE_RAISED_BY_PROVIDER
 * All transition to RESOLUTION_PENDING (Admin only)
 */
export async function POST(
    request: Request,
    props: { params: Promise<{ id: string }> }
) {
    try {
        const { id: jobId } = await props.params;
        const { type, reason, note } = await request.json(); // type: 'CUSTOMER' | 'PROVIDER'

        const cookieStore = await cookies();
        const userId = cookieStore.get('userId')?.value;
        const userRole = cookieStore.get('userRole')?.value;

        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const job = await prisma.job.findUnique({ where: { id: jobId } });
        if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

        let targetStatus: JobStatus;
        if (type === 'CUSTOMER') {
            if (job.status !== 'COMPLETED') {
                return NextResponse.json({ error: 'Customer can only raise issues after job completion.' }, { status: 400 });
            }
            targetStatus = 'ISSUE_RAISED_BY_CUSTOMER';
        } else if (type === 'PROVIDER') {
            const allowed = ['ARRIVING', 'ON_SITE', 'IN_PROGRESS'];
            if (!allowed.includes(job.status)) {
                return NextResponse.json({ error: 'Provider can only raise issues during deployment (Arriving/On Site/In Progress).' }, { status: 400 });
            }
            targetStatus = 'ISSUE_RAISED_BY_PROVIDER';
        } else {
            return NextResponse.json({ error: 'Invalid issue type' }, { status: 400 });
        }

        // Apply first issue state
        await applyStatusChange(jobId, targetStatus, {
            reason: `Issue raised: ${reason}. Note: ${note}`,
            changedById: userId,
            changedByRole: userRole
        });

        // Immediately move to RESOLUTION_PENDING to lock payouts and further actions
        await applyStatusChange(jobId, 'RESOLUTION_PENDING', {
            reason: 'Locked for Admin resolution',
            changedById: 'SYSTEM',
            changedByRole: 'SYSTEM'
        });

        return NextResponse.json({ success: true, status: 'RESOLUTION_PENDING' });
    } catch (error: any) {
        console.error('Issue raising error', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
