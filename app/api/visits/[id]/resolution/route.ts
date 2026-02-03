import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculatePrice } from '@/lib/pricing/visitEngine';

export async function POST(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const visitId = params.id;
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
            // Simplified: Just bump one tier for demo or use a fixed logic
            const currentTiers = ['H1', 'H2', 'H3'];
            const currentIndex = currentTiers.indexOf(visit.visit_tier);
            const nextTier = currentTiers[Math.min(currentIndex + 1, 2)];
            const nextPrice = calculatePrice(nextTier, visit.job.category); // Item class logic could be refined

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
