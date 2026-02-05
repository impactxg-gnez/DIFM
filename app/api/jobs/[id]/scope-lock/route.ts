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

        const primaryItem = await getCatalogueItem(visit.primary_job_item_id);

        // Check answers for uncertainty-sensitive questions
        // Spec: "IGNORE | BUFFER | FORCE_H3"
        for (const [qId, answer] of Object.entries(answers)) {
            if (answer === 'not_sure' || answer === 'No' || answer === 'No / Not sure') {
                // Determine if this is an uncertainty trigger
                if (primaryItem?.uncertainty_prone) {
                    if (primaryItem?.uncertainty_handling === 'BUFFER') {
                        extraMinutes += primaryItem.risk_buffer_minutes || 0;
                    } else if (primaryItem?.uncertainty_handling === 'FORCE_H3') {
                        forceH3 = true;
                    }
                }
            }
        }

        const effectiveMinutes = visit.base_minutes + extraMinutes;
        let finalTier = forceH3 ? 'H3' : calculateTier(effectiveMinutes);
        const finalPrice = calculatePrice(finalTier, visit.item_class);

        // 2. Create ScopeSummary Contract Snapshot
        const includes_text = "This visit covers the items listed above.";
        const excludes_text = "Additional or unrelated tasks not listed. Invasive work, regulated work, or specialist repairs unless explicitly booked.";
        const parts_text = "Labour price is fixed. Parts are only supplied with your approval and charged at cost with receipt.";
        const mismatch_rule = "If the job is different on arrival, we’ll upgrade the visit or rebook. No arguments on site.";

        await (prisma as any).$transaction([
            // Update Visit
            (prisma as any).visit.update({
                where: { id: visitId },
                data: {
                    tier: finalTier,
                    effective_minutes: effectiveMinutes,
                    price: finalPrice,
                    status: 'SCHEDULED'
                }
            }),
            // Save Summary (IMMUTABLE Source of Truth)
            (prisma as any).scopeSummary.create({
                data: {
                    visitId,
                    primary_job_item_id: visit.primary_job_item_id,
                    addon_job_item_ids: visit.addon_job_item_ids,
                    visit_tier: finalTier,
                    effective_minutes: effectiveMinutes,
                    includes_text,
                    excludes_text,
                    parts_rule_text: parts_text,
                    mismatch_rule_text: mismatch_rule,
                    scope_lock_answers: answers
                }
            }),
            // Move Job to ASSIGNING
            (prisma as any).job.update({
                where: { id: jobId },
                data: {
                    status: 'ASSIGNING',
                    statusUpdatedAt: new Date(),
                    priceLockedAt: new Date(),
                    fixedPrice: finalPrice // Update job fixedPrice to match visit price in V1 (single visit for now)
                }
            }),
            // Log state change
            (prisma as any).jobStateChange.create({
                data: {
                    jobId,
                    fromStatus: visit.job.status,
                    toStatus: 'ASSIGNING',
                    reason: 'Scope locked and confirmed',
                    changedByRole: 'CUSTOMER'
                }
            })
        ]);


        return NextResponse.json({ success: true, tier: finalTier, price: finalPrice });

    } catch (error) {
        console.error('Scope lock error', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
