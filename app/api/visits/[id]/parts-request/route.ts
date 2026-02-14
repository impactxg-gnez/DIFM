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
        const { partsBreakdown, partsNotes, partsPhotos } = body;

        const cookieStore = await cookies();
        const userId = cookieStore.get('userId')?.value;
        const userRole = cookieStore.get('userRole')?.value;

        if (!userId || userRole !== 'PROVIDER') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!partsBreakdown || !partsBreakdown.items || partsBreakdown.items.length === 0) {
            return NextResponse.json({ error: 'Parts breakdown is required' }, { status: 400 });
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

            // Verify visit is in progress
            if (visit.status !== 'IN_PROGRESS' && visit.job.status !== 'IN_PROGRESS') {
                throw new Error('Can only request parts during active work');
            }

            const now = new Date();

            // Update visit with parts request
            const updatedVisit = await tx.visit.update({
                where: { id: visitId },
                data: {
                    partsStatus: 'PENDING',
                    partsRequestedAt: now,
                    partsBreakdown,
                    partsNotes: partsNotes || null,
                    partsPhotos: partsPhotos || null,
                }
            });

            // Freeze job timer
            await tx.job.update({
                where: { id: visit.jobId },
                data: {
                    timerPausedAt: now,
                    timerPausedForParts: true,
                    timerPausedForPartsAt: now,
                }
            });

            return updatedVisit;
        });

        return NextResponse.json({ success: true, visit: result });

    } catch (error: any) {
        console.error('Parts request error', error);
        const message = error?.message || 'Internal Server Error';
        const statusCode = message.includes('authorized') || message.includes('only request') ? 400 : 500;
        return NextResponse.json({ error: message }, { status: statusCode });
    }
}
