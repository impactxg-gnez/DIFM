
import { prisma } from '../prisma';
import { advanceSequentialDispatch } from './matcher';

/**
 * Checks all jobs in ASSIGNING state and advances dispatch if current offer has expired (>10s)
 */
export async function ensureDispatchProgress() {
    const assigningJobs = await prisma.job.findMany({
        where: {
            status: 'ASSIGNING',
            offeredAt: {
                not: null
            }
        }
    });

    const now = Date.now();
    const results = [];

    for (const job of assigningJobs) {
        if (!job.offeredAt) continue;

        const offerAgeSeconds = (now - new Date(job.offeredAt).getTime()) / 1000;

        if (offerAgeSeconds >= 10) {
            console.log(`[DispatchTracker] Offer for job ${job.id} to provider ${job.offeredToId} expired after ${offerAgeSeconds.toFixed(1)}s. Advancing.`);
            const nextProviderId = await advanceSequentialDispatch(job.id);
            results.push({ jobId: job.id, action: 'EXPIRED', nextProviderId });
        }
    }

    // Also handle jobs in ASSIGNING state that haven't been offered to anyone yet
    const unofferedJobs = await prisma.job.findMany({
        where: {
            status: 'ASSIGNING',
            offeredToId: null
        }
    });

    for (const job of unofferedJobs) {
        console.log(`[DispatchTracker] Job ${job.id} is ASSIGNING but has no active offer. Starting dispatch.`);
        const nextProviderId = await advanceSequentialDispatch(job.id);
        results.push({ jobId: job.id, action: 'STARTED', nextProviderId });
    }

    return results;
}

/**
 * Moves jobs from BOOKED or WAITING_FOR_DISPATCH to ASSIGNING if they are ready for dispatch
 */
export async function activateBookedJobs() {
    const jobs = await prisma.job.findMany({
        where: {
            status: { in: ['BOOKED', 'WAITING_FOR_DISPATCH'] }
        },
        include: {
            visits: true
        }
    });

    const results = [];
    const now = new Date();
    const DISPATCH_BUFFER_MINUTES = 120; // 2 hours before scheduled time

    for (const job of jobs) {
        // V1: Job is ready for dispatch if it has a SCHEDULED (scope-locked) visit
        const isReady = job.visits.some((v: any) => v.status === 'SCHEDULED');

        if (!isReady) continue;

        let shouldActivate = false;
        if (job.isASAP) {
            shouldActivate = true;
        } else if (job.scheduledAt) {
            const scheduled = new Date(job.scheduledAt);
            const dispatchTime = new Date(scheduled.getTime() - DISPATCH_BUFFER_MINUTES * 60000);

            // Activate if we've reached the dispatch window (or if already past)
            if (now >= dispatchTime) {
                shouldActivate = true;
            }
        }

        if (shouldActivate) {
            console.log(`[DispatchTracker] Activating job ${job.id} (from ${job.status}). Moving to ASSIGNING.`);
            await prisma.job.update({
                where: { id: job.id },
                data: {
                    status: 'ASSIGNING',
                    statusUpdatedAt: now
                }
            });

            await prisma.jobStateChange.create({
                data: {
                    jobId: job.id,
                    fromStatus: job.status,
                    toStatus: 'ASSIGNING',
                    reason: 'Dispatch window reached',
                    changedById: 'SYSTEM',
                    changedByRole: 'SYSTEM'
                }
            });

            results.push({ jobId: job.id, action: 'ACTIVATED' });
        }
    }

    return results;
}
