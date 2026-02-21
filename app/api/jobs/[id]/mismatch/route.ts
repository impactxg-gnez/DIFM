import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getPriceByTier } from '@/lib/pricing/visitEngine';
import { excelSource } from '@/lib/pricing/excelLoader';
import { applyStatusChange } from '@/lib/jobStateMachine';
import { cookies } from 'next/headers';

/**
 * Step 6: Mismatch Handling
 * Action: "UPGRADE" (Small mismatch) | "REBOOK" (Large mismatch)
 */
export async function POST(
    request: Request,
    props: { params: Promise<{ id: string }> }
) {
    const { id: jobId } = await props.params;

    try {
        const body = await request.json();
        const { action, visitId, newTier, reason } = body;

        const cookieStore = await cookies();
        const userId = cookieStore.get('userId')?.value;
        const userRole = cookieStore.get('userRole')?.value;

        if (!userId || (userRole !== 'ADMIN' && userRole !== 'CUSTOMER')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const visit = await (prisma as any).visit.findUnique({
            where: { id: visitId },
            include: { job: true }
        });

        if (!visit || visit.jobId !== jobId) {
            return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
        }

        if (action === 'UPGRADE') {
            if (!newTier) return NextResponse.json({ error: 'New tier required for upgrade' }, { status: 400 });

            // Get ladder from excel
            const excelItem = excelSource.jobItems.get(visit.primary_job_item_id);
            const ladder = excelItem?.pricing_ladder || 'HANDYMAN';

            const newPrice = getPriceByTier(newTier, ladder);

            await (prisma as any).$transaction([
                // Update Visit
                (prisma as any).visit.update({
                    where: { id: visitId },
                    data: {
                        tier: newTier,
                        price: newPrice,
                        status: 'SCHEDULED' // Continue with upgraded visit
                    }
                }),
                // Update Job Total Price
                (prisma as any).job.update({
                    where: { id: jobId },
                    data: {
                        fixedPrice: newPrice, // Assuming 1:1 for V1
                        status: visit.job.status === 'MISMATCH_PENDING' ? 'IN_PROGRESS' : visit.job.status // Move back from MISMATCH_PENDING
                    }
                }),
                // Log state change
                (prisma as any).jobStateChange.create({
                    data: {
                        jobId,
                        fromStatus: visit.job.status,
                        toStatus: 'IN_PROGRESS',
                        reason: `Upgrade to ${newTier}: ${reason}`,
                        changedById: userId,
                        changedByRole: userRole
                    }
                })
            ]);

            return NextResponse.json({ success: true, newTier, newPrice });

        } else if (action === 'REBOOK') {
            // Large mismatch -> Rebook new visit
            await (prisma as any).$transaction([
                // Cancel current visit (mark as mismatch)
                (prisma as any).visit.update({
                    where: { id: visitId },
                    data: { status: 'CANCELLED' } // or 'SCOPE_MISMATCH'
                }),
                // Move Job to REBOOK_REQUIRED
                (prisma as any).job.update({
                    where: { id: jobId },
                    data: { status: 'REBOOK_REQUIRED' }
                }),
                // Log state change
                (prisma as any).jobStateChange.create({
                    data: {
                        jobId,
                        fromStatus: visit.job.status,
                        toStatus: 'REBOOK_REQUIRED',
                        reason: `Rebook requested: ${reason}`,
                        changedById: userId,
                        changedByRole: userRole
                    }
                })
            ]);

            return NextResponse.json({ success: true, action: 'REBOOK' });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    } catch (error: any) {
        console.error('Mismatch handling error', error);
        return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
    }
}
