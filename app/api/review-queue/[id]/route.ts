import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { dispatchJob } from '@/lib/dispatch/matcher';

type ReviewAction = 'APPROVED_WITH_CHANGES' | 'REJECTED';

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const userRole = cookieStore.get('userRole')?.value;
    const userId = cookieStore.get('userId')?.value;
    if (!userId || (userRole !== 'ADMIN' && userRole !== 'PROVIDER')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { id } = await props.params;
    const body = await request.json();
    const action = String(body.action || '') as ReviewAction;
    const customPriceRaw = body.custom_price;
    const customTimeRaw = body.custom_time;
    const notes = body.notes ? String(body.notes) : null;

    if (action !== 'APPROVED_WITH_CHANGES' && action !== 'REJECTED') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const row = await (prisma as any).reviewQueue.findUnique({
      where: { id },
      include: { job: true, visit: true }
    });
    if (!row) {
      return NextResponse.json({ error: 'Review queue item not found' }, { status: 404 });
    }
    if (row.status !== 'PENDING') {
      return NextResponse.json({ error: 'Review queue item already resolved' }, { status: 409 });
    }

    if (action === 'APPROVED_WITH_CHANGES') {
      const customPrice = Number(customPriceRaw);
      const customTime = Number(customTimeRaw);
      if (!Number.isFinite(customPrice) || customPrice <= 0 || !Number.isFinite(customTime) || customTime <= 0) {
        return NextResponse.json({ error: 'custom_price and custom_time are required for APPROVED_WITH_CHANGES' }, { status: 400 });
      }

      const result = await (prisma as any).$transaction(async (tx: any) => {
        await tx.visit.update({
          where: { id: row.visitId },
          data: {
            effective_minutes: Math.round(customTime),
            price: customPrice,
            status: 'SCHEDULED'
          }
        });

        const allVisits = await tx.visit.findMany({ where: { jobId: row.jobId } });
        const totalPrice = allVisits.reduce((sum: number, v: any) => sum + (v.price || 0), 0);
        const allLocked = allVisits.every((v: any) => v.status === 'SCHEDULED');
        const nextStatus = allLocked ? 'ASSIGNING' : 'PRICED';

        const updatedJob = await tx.job.update({
          where: { id: row.jobId },
          data: {
            fixedPrice: totalPrice,
            status: nextStatus,
            statusUpdatedAt: new Date(),
            reviewType: 'PRICING_OVERFLOW',
            reviewPriority: row.reviewPriority,
            needsReview: false
          }
        });

        await tx.reviewQueue.update({
          where: { id: row.id },
          data: {
            status: 'APPROVED_WITH_CHANGES',
            customPrice,
            customTime: Math.round(customTime),
            reviewerId: userId,
            reviewedAt: new Date(),
            resolutionNotes: notes
          }
        });

        await tx.auditLog.create({
          data: {
            action: 'PRICING_OVERFLOW_REVIEW_APPROVED',
            entityType: 'VISIT',
            entityId: row.visitId,
            details: JSON.stringify({
              review_queue_id: row.id,
              custom_price: customPrice,
              custom_time: Math.round(customTime),
              notes
            }),
            actorId: userId
          }
        });

        return {
          jobId: updatedJob.id,
          jobStatus: updatedJob.status
        };
      });

      if (result.jobStatus === 'ASSIGNING') {
        try {
          await dispatchJob(result.jobId);
        } catch (dispatchError) {
          console.error('[ReviewQueue] dispatch after approval failed', dispatchError);
        }
      }

      return NextResponse.json({
        success: true,
        action: 'APPROVED_WITH_CHANGES'
      });
    }

    await (prisma as any).$transaction(async (tx: any) => {
      await tx.reviewQueue.update({
        where: { id: row.id },
        data: {
          status: 'REJECTED',
          reviewerId: userId,
          reviewedAt: new Date(),
          resolutionNotes: notes,
          customPrice: null,
          customTime: null
        }
      });

      await tx.job.update({
        where: { id: row.jobId },
        data: {
          status: 'REVIEW_REQUIRED',
          statusUpdatedAt: new Date(),
          reviewType: 'PRICING_OVERFLOW',
          reviewPriority: row.reviewPriority,
          needsReview: true
        }
      });

      await tx.auditLog.create({
        data: {
          action: 'PRICING_OVERFLOW_REVIEW_REJECTED',
          entityType: 'VISIT',
          entityId: row.visitId,
          details: JSON.stringify({
            review_queue_id: row.id,
            notes
          }),
          actorId: userId
        }
      });
    });

    return NextResponse.json({
      success: true,
      action: 'REJECTED'
    });
  } catch (error) {
    console.error('[ReviewQueue] patch error', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
