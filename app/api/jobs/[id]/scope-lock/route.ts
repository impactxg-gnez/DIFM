import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateTier, calculatePrice } from '@/lib/pricing/visitEngine';
import { getCatalogueItem } from '@/lib/pricing/catalogue';

export async function POST(
    request: Request,
    props: { params: Promise<{ id: string }> }
) {
    try {
        const { id: jobId } = await props.params;
        const body = await request.json();
        const { visitId, answers } = body; // answers: { [questionId: string]: string }

        if (!visitId || !answers) {
            return NextResponse.json({ error: 'Missing visitId or answers' }, { status: 400 });
        }

        const visit = await (prisma as any).visit.findUnique({
            where: { id: visitId },
            include: { job: true }
        });

        if (!visit || visit.jobId !== jobId) {
            return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
        }

        // 1. Process Uncertainty & Calculate Final Tier
        let extraMinutes = 0;
        let forceH3 = false;

        const primaryItem = await getCatalogueItem(visit.primaryItemId);

        // Check answers for uncertainty-sensitive questions
        // Spec: "IGNORE | BUFFER | FORCE_H3"
        for (const [qId, answer] of Object.entries(answers)) {
            if (answer === 'not_sure') {
                if (primaryItem?.uncertainty_handling === 'BUFFER') {
                    extraMinutes += primaryItem.risk_buffer_minutes || 0;
                } else if (primaryItem?.uncertainty_handling === 'FORCE_H3') {
                    forceH3 = true;
                }
            }
        }

        const effectiveMinutes = visit.total_minutes + extraMinutes;
        let finalTier = forceH3 ? 'H3' : calculateTier(effectiveMinutes);
        const finalPrice = calculatePrice(finalTier, visit.job.category); // Using job category as item class proxy if needed

        // 2. Create ScopeSummary Contract Snapshot
        const snapshot = {
            effective_minutes: effectiveMinutes,
            tier: finalTier,
            includes_text: "This visit covers the items listed above.",
            excludes_text: "Additional or unrelated tasks not listed. Invasive work, regulated work, or specialist repairs unless explicitly booked.",
            parts_text: "Labour price is fixed. Parts are only supplied with your approval and charged at cost with receipt.",
            mismatch_rule: "If the job is different on arrival, we’ll upgrade the visit or rebook. No arguments on site."
        };

        await (prisma as any).$transaction([
            // Update Visit
            (prisma as any).visit.update({
                where: { id: visitId },
                data: {
                    visit_tier: finalTier,
                    total_minutes: effectiveMinutes,
                    price: finalPrice,
                    status: 'SCHEDULED' // Lock scope -> move to ready
                }
            }),
            // Save Summary
            (prisma as any).scopeSummary.create({
                data: {
                    visitId,
                    snapshot,
                    answers
                }
            }),
            // Move Job to DISPATCHED if all visits are locked?
            // For V1 simple: Move job to DISPATCHED immediately after first scope lock or book?
            // Spec says: "After Final... Lock scope contract snapshot. After this, only Upgrade/Rebook is allowed."
            (prisma as any).job.update({
                where: { id: jobId },
                data: {
                    status: 'DISPATCHED',
                    statusUpdatedAt: new Date(),
                    priceLockedAt: new Date()
                }
            })
        ]);


        return NextResponse.json({ success: true, tier: finalTier, price: finalPrice });

    } catch (error) {
        console.error('Scope lock error', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
