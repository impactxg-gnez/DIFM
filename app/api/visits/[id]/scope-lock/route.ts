import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateTier, calculatePrice } from '@/lib/pricing/visitEngine';
import { getCatalogueItem } from '@/lib/pricing/catalogue';
import { dispatchJob } from '@/lib/dispatch/matcher';

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
    // Check ALL items in visit (primary + addons) for BUFFER handling
    let extraMinutes = 0;
    let forceH3 = false;

    // Get primary item
    const primaryItem = await getCatalogueItem(visit.primary_job_item_id);
    
    // Get all addon items
    const addonItems = await Promise.all(
      (visit.addon_job_item_ids || []).map((itemId: string) => getCatalogueItem(itemId))
    );
    
    // All items in this visit (primary + addons)
    const allItems = [primaryItem, ...addonItems].filter(Boolean);

    // Check if ANY answer indicates uncertainty ("not_sure")
    const hasUncertaintyAnswer = Object.values(answers).some(
      (answer) => answer === 'not_sure' || answer === 'No' || answer === 'No / Not sure'
    );

    if (hasUncertaintyAnswer) {
      // For each item in the visit, check if it needs BUFFER or FORCE_H3
      for (const item of allItems) {
        if (!item) continue;
        
        if (item.uncertainty_prone) {
          if (item.uncertainty_handling === 'BUFFER') {
            // Sum risk_buffer_minutes for each BUFFER item (apply once per item)
            extraMinutes += item.risk_buffer_minutes || 0;
            console.log(`[ScopeLock] BUFFER applied: ${item.job_item_id} adds ${item.risk_buffer_minutes}min buffer`);
          } else if (item.uncertainty_handling === 'FORCE_H3') {
            // FORCE_H3 takes precedence (only need one item to trigger)
            forceH3 = true;
            console.log(`[ScopeLock] FORCE_H3 triggered by: ${item.job_item_id}`);
            break; // FORCE_H3 is absolute, no need to check other items
          }
        }
      }
    }

    // Calculate effective minutes: base_minutes + sum of all BUFFER risk_buffer_minutes
    const effectiveMinutes = (visit.base_minutes ?? 0) + extraMinutes;
    
    // Recalculate tier based on effective_minutes (unless FORCE_H3)
    const finalTier = forceH3 ? 'H3' : calculateTier(effectiveMinutes);
    
    // Recalculate price based on new tier
    const finalPrice = calculatePrice(finalTier, visit.item_class);
    
    console.log(`[ScopeLock] Visit ${visitId}: base=${visit.base_minutes}min, buffer=${extraMinutes}min, effective=${effectiveMinutes}min, tier=${finalTier}, price=£${finalPrice}`);

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

      return { totalPrice, jobStatus: updatedJob.status, allLocked, jobId: visit.jobId };
    });

    // After transaction: Broadcast job to eligible providers if all visits are locked
    if (result.allLocked && result.jobStatus === 'ASSIGNING') {
      try {
        console.log(`[Dispatch] Triggering broadcast dispatch for job ${result.jobId}`);
        const eligibleProviders = await dispatchJob(result.jobId);
        if (eligibleProviders && eligibleProviders.length > 0) {
          console.log(`[Dispatch] Job ${result.jobId} broadcast to ${eligibleProviders.length} providers`);
        } else {
          console.warn(`[Dispatch] No eligible providers found for job ${result.jobId} - job will remain in ASSIGNING status`);
          console.warn(`[Dispatch] Check: Are there active online providers? Do they match the job category/capabilities?`);
        }
      } catch (dispatchError) {
        console.error('[Dispatch] Error after scope lock:', dispatchError);
        console.error('[Dispatch] Stack trace:', dispatchError instanceof Error ? dispatchError.stack : 'No stack trace');
        // Don't fail the scope lock if dispatch fails - job is still in ASSIGNING and can be dispatched later
      }
    } else {
      console.log(`[Dispatch] Not dispatching job ${result.jobId}: allLocked=${result.allLocked}, jobStatus=${result.jobStatus}`);
    }

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


