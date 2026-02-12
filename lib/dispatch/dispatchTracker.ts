
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
