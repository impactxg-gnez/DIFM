import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateTier, calculatePrice } from '@/lib/pricing/visitEngine';
import { getCatalogueItem } from '@/lib/pricing/catalogue';

/**
 * Visit-first Scope Lock
 * - Locks a single Visit's tier/price based on uncertainty answers
 * - Writes immutable ScopeSummary snapshot
 * - Updates Job fixedPrice as SUM(visits.price) and advances Job status to ASSIGNING only when all visits are locked
 */
export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id: visitId } = await props.params;
    const body = await request.json();
    const { answers } = body as { answers: Record<string, string> };

    if (!answers) {
      return NextResponse.json({ error: 'Missing answers' }, { status: 400 });
    }

    const visit = await (prisma as any).visit.findUnique({
      where: { id: visitId },
      include: { job: true },
    });

    if (!visit) {
      return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
    }

    // 1. Process uncertainty & compute final effective minutes
    let extraMinutes = 0;
    let forceH3 = false;

    const primaryItem = await getCatalogueItem(visit.primary_job_item_id);

    for (const [, answer] of Object.entries(answers)) {
      if (answer === 'not_sure' || answer === 'No' || answer === 'No / Not sure') {
        if (primaryItem?.uncertainty_prone) {
          if (primaryItem.uncertainty_handling === 'BUFFER') {
            extraMinutes += primaryItem.risk_buffer_minutes || 0;
          } else if (primaryItem.uncertainty_handling === 'FORCE_H3') {
            forceH3 = true;
          }
        }
      }
    }

    const effectiveMinutes = (visit.base_minutes ?? 0) + extraMinutes;
    const finalTier = forceH3 ? 'H3' : calculateTier(effectiveMinutes);
    const finalPrice = calculatePrice(finalTier, visit.item_class);

    // 2. Immutable ScopeSummary snapshot (minimal contract text for now)
    const includes_text = 'This visit covers the items listed above.';
    const excludes_text =
      'Additional or unrelated tasks not listed. Invasive work, regulated work, or specialist repairs unless explicitly booked.';
    const parts_text =
      'Labour price is fixed. Parts are only supplied with your approval and charged at cost with receipt.';
    const mismatch_rule =
      'If the job is different on arrival, we’ll upgrade the visit or rebook. No arguments on site.';

    const result = await (prisma as any).$transaction(async (tx: any) => {
      // Update visit
      await tx.visit.update({
        where: { id: visitId },
        data: {
          tier: finalTier,
          effective_minutes: effectiveMinutes,
          price: finalPrice,
          status: 'SCHEDULED',
        },
      });

      // Write scope summary (one per visit)
      // If it already exists, keep it immutable (do not overwrite).
      const existing = await tx.scopeSummary.findUnique({ where: { visitId } });
      if (!existing) {
        await tx.scopeSummary.create({
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
            scope_lock_answers: answers,
          },
        });
      }

      // Recompute job totals from visits (visit is the primary pricing unit)
      const allVisits = await tx.visit.findMany({ where: { jobId: visit.jobId } });
      const totalPrice = allVisits.reduce((sum: number, v: any) => sum + (v.price || 0), 0);
      const allLocked = allVisits.every((v: any) => v.status === 'SCHEDULED');

      const now = new Date();
      const updatedJob = await tx.job.update({
        where: { id: visit.jobId },
        data: {
          fixedPrice: totalPrice,
          ...(allLocked
            ? {
                status: 'ASSIGNING',
                statusUpdatedAt: now,
                priceLockedAt: now,
              }
            : {}),
        },
      });

      if (allLocked && visit.job.status !== 'ASSIGNING') {
        await tx.jobStateChange.create({
          data: {
            jobId: visit.jobId,
            fromStatus: visit.job.status,
            toStatus: 'ASSIGNING',
            reason: 'All visits scope-locked and confirmed',
            changedByRole: 'CUSTOMER',
          },
        });
      }

      return { totalPrice, jobStatus: updatedJob.status, allLocked };
    });

    return NextResponse.json({
      success: true,
      visit_id: visitId,
      tier: finalTier,
      price: finalPrice,
      total_price: result.totalPrice,
      job_status: result.jobStatus,
      all_visits_locked: result.allLocked,
    });
  } catch (error) {
    console.error('Visit scope lock error', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}


