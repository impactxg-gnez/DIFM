import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateTierAndPrice } from '@/lib/pricing/visitEngine';
import { excelSource } from '@/lib/pricing/excelLoader';

export async function POST(
    request: Request,
    props: { params: Promise<{ id: string }> }
) {
    try {
        const { id: visitId } = await props.params;
        const body = await request.json();
        const { action } = body; // "UPGRADE" or "REBOOK"

        if (!action) {
            return NextResponse.json({ error: 'Missing action' }, { status: 400 });
        }

        const visit = await (prisma as any).visit.findUnique({
            where: { id: visitId },
            include: { job: true }
        });

        if (!visit || visit.status !== 'MISMATCH') {
            return NextResponse.json({ error: 'Visit not in mismatch state' }, { status: 404 });
        }

        if (action === 'UPGRADE') {
            // Logic: Upgrade to next tier (e.g. H1 -> H2) or use suggestedTier from notes
            // Simplified: Just bump by 60 mins for logic calculation
            const currentMins = visit.effective_minutes || 60;
            const nextMins = currentMins + 45; // Arbitrary bump to push into next tier

            // Get ladder from excel
            const excelItem = excelSource.jobItems.get(visit.primary_job_item_id);
            const ladder = excelItem?.pricing_ladder || 'HANDYMAN';

            const { tier: nextTier, price: nextPrice } = calculateTierAndPrice(nextMins, ladder);

            await (prisma as any).visit.update({
                where: { id: visitId },
                data: {
                    visit_tier: nextTier,
                    price: nextPrice,
                    status: 'SCHEDULED' // Resolve back to scheduled
                }
            });

            return NextResponse.json({ success: true, newTier: nextTier, newPrice: nextPrice });

        } else if (action === 'REBOOK') {
            // Logic: Cancel current visit/job, provide 100% credit (simplified for now)
            await (prisma as any).visit.update({
                where: { id: visitId },
                data: { status: 'CANCELLED_FREE' }
            });

            await (prisma as any).job.update({
                where: { id: visit.jobId },
                data: { status: 'CANCELLED_FREE' }
            });

            return NextResponse.json({ success: true, message: 'Job rebooked (cancelled for now)' });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    } catch (error) {
        console.error('Resolution error', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
