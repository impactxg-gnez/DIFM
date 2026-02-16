import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applyStatusChange, JobStatus } from '@/lib/jobStateMachine';
import { cookies } from 'next/headers';

export async function POST(
    request: Request,
    props: { params: Promise<{ id: string }> }
) {
    try {
        const { id: jobId } = await props.params;
        const { action, note } = await request.json();
        const cookieStore = await cookies();
        const adminId = cookieStore.get('userId')?.value;
        const userRole = cookieStore.get('userRole')?.value;

        if (!adminId || userRole !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized: Admin only' }, { status: 403 });
        }

        if (!action) {
            return NextResponse.json({ error: 'Missing action' }, { status: 400 });
        }

        const job = await prisma.job.findUnique({
            where: { id: jobId }
        });

        if (!job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        let targetStatus: JobStatus;
        let clearProvider = false;
        let clearOffer = false;

        switch (action) {
            case 'APPROVE':
                // Return to ASSIGNING. The sequentially offered provider might accept it again,
                // or we could force it back to ASSIGNED if they are already assigned.
                // In V2, FLAGGED_REVIEW usually comes from ASSIGNING/ASSIGNED.
                targetStatus = 'ASSIGNING';
                break;
            case 'REROUTE':
                targetStatus = 'ASSIGNING';
                clearOffer = true;
                break;
            case 'RESCHEDULE':
                targetStatus = 'RESCHEDULE_REQUIRED';
                break;
            case 'CANCEL':
                targetStatus = 'CANCELLED_FREE';
                break;
            default:
                return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        // Apply state change
        await applyStatusChange(jobId, targetStatus, {
            reason: `Admin resolution (${action}): ${note || 'No notes'}`,
            changedById: adminId,
            changedByRole: 'ADMIN'
        });

        // Perform cleanups
        if (clearOffer || clearProvider) {
            await prisma.job.update({
                where: { id: jobId },
                data: {
                    offeredToId: clearOffer ? null : undefined,
                    offeredAt: clearOffer ? null : undefined,
                }
            });
        }

        // Clear flagging metadata on resolution
        await prisma.job.update({
            where: { id: jobId },
            data: {
                flagReason: null,
                flagNote: null,
                flaggedById: null,
                flaggedAt: null
            }
        });

        return NextResponse.json({ success: true, targetStatus });
    } catch (error) {
        console.error('Flag resolution error', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
