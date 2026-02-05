import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PLATFORM_FEE_PERCENT } from '@/lib/constants';
import { canTransition, JobStatus } from '@/lib/jobStateMachine';
import { cookies } from 'next/headers';

export async function POST(
    request: Request,
    props: { params: Promise<{ id: string }> }
) {
    const { id } = await props.params;

    try {
        const body = await request.json();
        const { status, reason, completionNotes, partsRequiredAtCompletion, partsNotes, partsPhotos, completionPhotos, disputeNotes, disputePhotos, completionLat, completionLng, completionLocationVerified, isAccessAvailable, arrivalWindowStart, arrivalWindowEnd } = body as any;

        const cookieStore = await cookies();
        const userId = cookieStore.get('userId')?.value;
        const userRole = cookieStore.get('userRole')?.value;

        if (!userId || !userRole) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const result = await prisma.$transaction(async (tx) => {
            const job = await tx.job.findUnique({ where: { id } });
            if (!job) throw new Error("Job not found");

            const currentStatus = job.status as JobStatus;

            if (!canTransition(currentStatus, status)) {
                throw new Error(`Invalid transition ${currentStatus} -> ${status}`);
            }

            if (userRole === 'PROVIDER' && job.providerId !== userId) {
                // Special case for ASSIGNING -> ASSIGNED (Accepting job)
                if (currentStatus === 'ASSIGNING' && status === 'ASSIGNED') {
                    // Check if offered to this provider
                    if (job.offeredToId !== userId) {
                        throw new Error('This job offer is not for you or has expired');
                    }
                } else {
                    throw new Error('Not authorized for this job');
                }
            }

            // Step 5: Completion Evidence Enforcement
            if (status === 'COMPLETED' && userRole === 'PROVIDER') {
                if (!completionPhotos || completionPhotos.trim() === '') {
                    throw new Error('Photo/Video evidence is required for completion');
                }
            }

            // Step 5: Timer & Access Logic
            if (status === 'IN_PROGRESS' && userRole === 'PROVIDER') {
                if (!isAccessAvailable && !job.isAccessAvailable) {
                    throw new Error('Cannot start timer until access is confirmed available');
                }
            }

            const now = new Date();
            const cancellationReason = status === 'CLOSED' && job.status === 'ISSUE_REPORTED' ? (reason || 'Resolved') : job.cancellationReason;

            const updatedJob = await tx.job.update({
                where: { id },
                data: {
                    status,
                    statusUpdatedAt: now,
                    providerId: (currentStatus === 'ASSIGNING' && status === 'ASSIGNED') ? userId : job.providerId,
                    cancellationReason,
                    isAccessAvailable: isAccessAvailable ?? job.isAccessAvailable,
                    arrivalWindowStart: arrivalWindowStart ? new Date(arrivalWindowStart) : job.arrivalWindowStart,
                    arrivalWindowEnd: arrivalWindowEnd ? new Date(arrivalWindowEnd) : job.arrivalWindowEnd,
                    timerStartedAt: (status === 'IN_PROGRESS' && !job.timerStartedAt) ? now : job.timerStartedAt,

                    // Update completion evidence
                    ...(status === 'COMPLETED' ? {
                        completionNotes: completionNotes || "Job completed",
                        completionPhotos: completionPhotos,
                        partsRequiredAtCompletion: job.category === 'CLEANING' ? 'N/A' : (partsRequiredAtCompletion || 'NO'),
                        partsNotes: partsNotes || null,
                        partsPhotos: partsPhotos || null,
                        completionLat: completionLat || null,
                        completionLng: completionLng || null,
                        completionLocationVerified: completionLocationVerified || false,
                    } : {}),

                    // Update dispute data if customer is disputing
                    ...(status === 'DISPUTED' && userRole === 'CUSTOMER' ? {
                        disputeReason: reason || 'No reason provided',
                        disputeNotes: disputeNotes || null,
                        disputePhotos: disputePhotos || null,
                        disputedAt: now,
                    } : {}),

                    // Update dispute resolution if admin is resolving
                    ...(status === 'CLOSED' && job.status === 'DISPUTED' && userRole === 'ADMIN' ? {
                        disputeResolvedAt: now,
                        disputeResolution: reason || 'Resolved by admin',
                    } : {}),
                }
            });

            await tx.jobStateChange.create({
                data: {
                    jobId: id,
                    fromStatus: currentStatus,
                    toStatus: status,
                    reason,
                    changedById: userId,
                    changedByRole: userRole,
                },
            });

            if (status === 'COMPLETED') {
                const price = job.priceOverride ?? job.fixedPrice;
                // Use override fee if set, otherwise calculate default 18%
                const platformFee = job.platformFeeOverride ?? (price * PLATFORM_FEE_PERCENT);
                const payout = price - platformFee;

                await tx.transaction.create({
                    data: {
                        jobId: id,
                        amount: payout,
                        type: 'PAYOUT',
                        status: 'PENDING',
                        userId: job.providerId
                    }
                });

                await tx.transaction.create({
                    data: {
                        jobId: id,
                        amount: platformFee,
                        type: 'FEE',
                        status: 'COMPLETED',
                        userId: job.providerId
                    }
                });
            }

            // Create general AuditLog for Admin actions
            if (userRole === 'ADMIN') {
                await tx.auditLog.create({
                    data: {
                        action: 'JOB_STATUS_CHANGE',
                        entityId: id,
                        entityType: 'JOB',
                        details: `Status changed from ${currentStatus} to ${status}. Reason: ${reason || 'No reason provided'}`,
                        actorId: userId
                    }
                });
            }

            return updatedJob;
        });

        return NextResponse.json({ success: true, job: result });

    } catch (error: any) {
        console.error('Update status error', error);
        const message = error?.message || 'Internal Server Error';
        const statusCode = message.includes('Invalid transition') || message.includes('authorized') ? 400 : 500;
        return NextResponse.json({ error: message }, { status: statusCode });
    }
}
