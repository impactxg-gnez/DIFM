import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateTierAndPrice } from '@/lib/pricing/visitEngine';
import { excelSource } from '@/lib/pricing/excelLoader';
import { dispatchJob } from '@/lib/dispatch/matcher';
import { JobStatus } from '@/lib/jobStateMachine';
import { cookies } from 'next/headers';
import { uploadPhoto, recordPhotoMetadata, BUCKETS, ensureBuckets } from '@/lib/storage';

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
    console.log(`[ScopeLock] Starting for visit ${visitId}`);

    // Ensure storage buckets exist
    await ensureBuckets().catch(e => console.error('ensureBuckets failed', e));

    const body = await request.json();
    const { answers, scope_photos } = body as {
      answers: Record<string, string>,
      scope_photos: string | string[] // Can be single base64 or array
    };

    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value || 'ANONYMOUS';

    if (!answers) {
      return NextResponse.json({ error: 'Missing answers' }, { status: 400 });
    }

    if (!scope_photos || scope_photos.length === 0) {
      return NextResponse.json({ error: 'At least one photo is required' }, { status: 400 });
    }

    const visit = await (prisma as any).visit.findUnique({
      where: { id: visitId },
      include: { job: true },
    });

    if (!visit) {
      return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
    }

    // 0. Immutability Guard: Cannot edit scope after confirmation
    if (visit.status !== 'DRAFT') {
      return NextResponse.json({ error: 'Scope is already locked and cannot be edited.' }, { status: 400 });
    }

    // 1. Process uncertainty & compute final effective minutes
    // Check ALL items in visit (primary + addons) for BUFFER handling
    let extraMinutes = 0;
    let forceH3 = false;

    // Cleaning Scalers: Determination logic
    if (visit.item_class === 'CLEANING') {
      const { bedrooms, bathrooms, property_type } = answers;

      if (!bedrooms || !bathrooms || !property_type) {
        return NextResponse.json({ error: 'Cleaning jobs require bedrooms, bathrooms, and property type selection.' }, { status: 400 });
      }

      const beds = parseInt(bedrooms);
      const baths = parseInt(bathrooms);

      // base_clean_1bed = 90 mins (visit.base_minutes)
      // additional_bed = +30 mins
      // additional_bath = +20 mins
      const extraBeds = Math.max(0, beds - 1);
      const extraBaths = Math.max(0, baths - 1);
      extraMinutes += (extraBeds * 30) + (extraBaths * 20);
      console.log(`[ScopeLock] Cleaning scalers: beds=${beds}, baths=${baths}, extraMinutes=${extraMinutes}`);
    }

    // Get primary item
    const primaryItem = excelSource.jobItems.get(visit.primary_job_item_id);

    // Get all addon items
    const addonItems = (visit.addon_job_item_ids || []).map((itemId: string) => excelSource.jobItems.get(itemId));

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

    // Calculate effective minutes
    const effectiveMinutes = (visit.base_minutes ?? 0) + extraMinutes;

    // Get ladder from excel
    const ladder = primaryItem?.pricing_ladder || (visit.item_class === 'CLEANING' ? 'CLEANING' : 'HANDYMAN');

    // Recalculate tier based on effective_minutes (unless FORCE_H3 or CLEANING)
    let { tier: finalTier, price: finalPrice } = forceH3
      ? { tier: 'H3', price: calculateTierAndPrice(150, ladder).price }
      : calculateTierAndPrice(effectiveMinutes, ladder);

    // CLEANING specialized tier mapping (Override if cleaning)
    if (visit.item_class === 'CLEANING') {
      const beds = parseInt(answers.bedrooms || '1');
      const baths = parseInt(answers.bathrooms || '1');
      const totalRooms = beds + baths;

      if (totalRooms <= 2) finalTier = 'C1';
      else if (totalRooms <= 4) finalTier = 'C2';
      else finalTier = 'C3';

      finalPrice = calculateTierAndPrice(effectiveMinutes, 'CLEANING').price; // Or use strict cleaning tier price
      console.log(`[ScopeLock] Cleaning Final: rooms=${totalRooms}, tier=${finalTier}`);
    }

    console.log(`[ScopeLock] Visit ${visitId}: base=${visit.base_minutes}min, extra=${extraMinutes}min, effective=${effectiveMinutes}min, tier=${finalTier}, price=£${finalPrice}`);

    // 2. Immutable ScopeSummary snapshot (minimal contract text for now)
    const includes_text = 'This visit covers the items listed above.';
    const excludes_text =
      'Additional or unrelated tasks not listed. Invasive work, regulated work, or specialist repairs unless explicitly booked.';
    const parts_text =
      'Labour price is fixed. Parts are only supplied with your approval and charged at cost with receipt.';
    const mismatch_rule =
      'If the job is different on arrival, we’ll upgrade the visit or rebook. No arguments on site.';

    // 3. Handle Photo Uploads to Supabase (Outside Transaction)
    const photosArray = Array.isArray(scope_photos) ? scope_photos : [scope_photos];
    console.log(`[ScopeLock] Starting storage upload for visit ${visitId}. Photos count: ${photosArray.length}`);
    const uploadedPaths: string[] = [];

    for (let i = 0; i < photosArray.length; i++) {
      const photoData = photosArray[i];
      if (!photoData || photoData.length < 100) continue;

      const path = `${visitId}/${Date.now()}_${i}.jpg`;
      console.log(`[ScopeLock] Uploading photo ${i} to ${path}`);
      let body: Buffer;
      if (photoData.startsWith('data:image')) {
        body = Buffer.from(photoData.split(',')[1], 'base64');
      } else {
        body = Buffer.from(photoData, 'base64');
      }

      try {
        await uploadPhoto(BUCKETS.SCOPE_PHOTOS, path, body);
        uploadedPaths.push(path);
      } catch (uploadError) {
        console.error(`[ScopeLock] Photo upload failed for index ${i}:`, uploadError);
        throw uploadError; // Rethrow to hit main catch
      }
    }

    console.log(`[ScopeLock] Storage upload complete. Uploaded paths: ${uploadedPaths.join(',')}`);

    const result = await (prisma as any).$transaction(async (tx: any) => {
      console.log(`[ScopeLock] Starting transaction for visit ${visitId}`);
      // Record metadata for each photo inside transaction
      for (const path of uploadedPaths) {
        await tx.visitPhoto.create({
          data: {
            visitId,
            jobId: visit.jobId,
            bucket: BUCKETS.SCOPE_PHOTOS,
            path,
            uploadedBy: userId,
            photoType: 'SCOPE',
            deleteAfter: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days (3 months)
          }
        });
      }

      console.log(`[ScopeLock] Updating visit ${visitId}`);

      // Update visit
      await tx.visit.update({
        where: { id: visitId },
        data: {
          tier: finalTier,
          effective_minutes: effectiveMinutes,
          price: finalPrice,
          status: 'SCHEDULED',
          scope_photos: uploadedPaths.join(','),
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
      const DISPATCH_BUFFER_MINUTES = 120; // 2 hours

      // Determine target status based on schedule
      let targetStatus: JobStatus = 'ASSIGNING';
      if (allLocked && visit.job.scheduledAt) {
        const scheduled = new Date(visit.job.scheduledAt);
        const dispatchTime = new Date(scheduled.getTime() - DISPATCH_BUFFER_MINUTES * 60000);
        if (now < dispatchTime) {
          targetStatus = 'WAITING_FOR_DISPATCH';
        }
      }

      const updatedJob = await tx.job.update({
        where: { id: visit.jobId },
        data: {
          fixedPrice: totalPrice,
          ...(allLocked
            ? {
              status: targetStatus,
              statusUpdatedAt: now,
              priceLockedAt: now,
            }
            : {}),
        },
      });

      if (allLocked && visit.job.status !== targetStatus) {
        await tx.jobStateChange.create({
          data: {
            jobId: visit.jobId,
            fromStatus: visit.job.status,
            toStatus: targetStatus,
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
      effective_minutes: effectiveMinutes,
      total_price: result.totalPrice,
      job_status: result.jobStatus,
      all_visits_locked: result.allLocked,
    });
  } catch (error: any) {
    console.error('Visit scope lock error', error);
    return NextResponse.json({
      error: 'Internal Server Error',
      message: `SCOPELOCK_FAIL: ${error.message || 'Unknown'}`
    }, { status: 500 });
  }
}


