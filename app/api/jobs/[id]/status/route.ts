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
        let { status, reason, completionNotes, partsRequiredAtCompletion, partsNotes, partsPhotos, completionPhotos, disputeNotes, disputePhotos, completionLat, completionLng, completionLocationVerified, isAccessAvailable, arrivalWindowStart, arrivalWindowEnd, scheduledAt } = body as any;

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

            const now = new Date();

            if (userRole === 'PROVIDER' && job.providerId !== userId) {
                // Special case for ASSIGNING -> ASSIGNED (Accepting job)
                // Broadcast mode: Any eligible provider can accept
                if (currentStatus === 'ASSIGNING' && status === 'ASSIGNED') {
                    // Verify provider is eligible for this job (matches category/capabilities)
                    const provider = await tx.user.findUnique({ where: { id: userId } });
                    if (!provider || provider.providerStatus !== 'ACTIVE' || !provider.isOnline) {
                        throw new Error('You must be an active, online provider to accept jobs');
                    }

                    const providerCategories = provider.categories?.split(',').filter(Boolean) || [];
                    const providerCapabilities = provider.capabilities?.split(',').filter(Boolean) || [];

                    // Check if provider matches the job
                    let isEligible = false;

                    // CLEANING jobs can only be done by cleaners
                    if (job.category === 'CLEANING') {
                        if (providerCategories.includes('CLEANING')) {
                            // Check capability match if required
                            if (job.requiredCapability && job.requiredCapability.startsWith('C-')) {
                                isEligible = providerCapabilities.includes(job.requiredCapability);
                            } else {
                                isEligible = true;
                            }
                        }
                    } else {
                        // For non-cleaning jobs: handymen or matching specialists
                        if (provider.providerType === 'HANDYMAN') {
                            // Handymen can do general jobs and those matching their capabilities
                            if (!job.requiredCapability || providerCapabilities.includes(job.requiredCapability)) {
                                isEligible = true;
                            }
                        } else if (providerCategories.includes(job.category)) {
                            isEligible = true;
                        }
                    }

                    if (!isEligible) {
                        throw new Error('This job does not match your skills or category');
                    }
                } else {
                    throw new Error('Not authorized for this job');
                }
            }

            // Step 5: Completion Evidence & Parts Guard
            if (status?.toUpperCase() === 'COMPLETED') {
                if (!completionPhotos || completionPhotos.trim() === '') {
                    throw new Error('Photo/Video evidence is required for completion');
                }

                // Check for PENDING parts in any visit
                const visitsWithPendingParts = await tx.visit.findFirst({
                    where: {
                        jobId: id,
                        partsStatus: 'PENDING'
                    }
                });

                if (visitsWithPendingParts) {
                    throw new Error('Cannot complete job while parts approval is PENDING. Please approve or reject parts first.');
                }
            }

            // Step 5: Timer & Access Logic
            if (status === 'ON_SITE' && userRole === 'PROVIDER') {
                if (job.scheduledAt) {
                    const scheduled = new Date(job.scheduledAt);
                    const windowEnd = new Date(scheduled.getTime() + 30 * 60 * 1000);
                    if (now < scheduled || now > windowEnd) {
                        throw new Error(`Arrival window mismatch. Scheduled: ${scheduled.toLocaleTimeString()}. You must arrive between ${scheduled.toLocaleTimeString()} and ${windowEnd.toLocaleTimeString()}.`);
                    }
                }
            }

            if (status === 'IN_PROGRESS' && userRole === 'PROVIDER') {
                if (!isAccessAvailable && !job.isAccessAvailable && currentStatus !== 'ON_SITE') {
                    throw new Error('Cannot start timer until access is confirmed available');
                }
            }

            // WAITING_FOR_DISPATCH logic
            // If status is BOOKED and there is a future schedule, move to WAITING_FOR_DISPATCH
            let targetStatus = status;
            if (status === 'BOOKED') {
                const finalScheduledAt = scheduledAt ? new Date(scheduledAt) : job.scheduledAt;
                if (finalScheduledAt) {
                    const DISPATCH_BUFFER_MINUTES = 120; // Start dispatch 2 hours before
                    const dispatchTime = new Date(finalScheduledAt.getTime() - DISPATCH_BUFFER_MINUTES * 60000);
                    if (now < dispatchTime) {
                        targetStatus = 'WAITING_FOR_DISPATCH';
                        console.log(`[Lifecycle] Job ${id} entering WAITING_FOR_DISPATCH (scheduled logic).`);
                    }
                }
            }

            const cancellationReason = status === 'CLOSED' && job.status === 'ISSUE_REPORTED' ? (reason || 'Resolved') : job.cancellationReason;

            // For ASSIGNING -> ASSIGNED transition, use updateMany with conditions to prevent race conditions
            // Broadcast mode: First provider to accept gets the job (atomic update)
            let updatedJob;
            if (currentStatus === 'ASSIGNING' && status === 'ASSIGNED' && userRole === 'PROVIDER') {
                // Use updateMany with status condition to ensure atomic first-come-first-served
                const updateResult = await tx.job.updateMany({
                    where: {
                        id,
                        status: 'ASSIGNING', // Only update if still in ASSIGNING
                        offeredToId: userId  // Sequential: only if it's currently offered to THIS provider
                    },
                    data: {
                        status: 'ASSIGNED',
                        statusUpdatedAt: now,
                        providerId: userId,
                        acceptedAt: now,
                        offeredToId: null, // Clear any legacy offer data
                        offeredAt: null
                    }
                });

                if (updateResult.count === 0) {
                    throw new Error('This job has already been accepted by another provider.');
                }

                // Fetch the updated job
                updatedJob = await tx.job.findUnique({ where: { id } });
                if (!updatedJob) throw new Error('Failed to fetch updated job');
            } else {
                updatedJob = await tx.job.update({
                    where: { id },
                    data: {
                        status: targetStatus,
                        statusUpdatedAt: now,
                        providerId: (currentStatus === 'ASSIGNING' && targetStatus === 'ASSIGNED') ? userId : job.providerId,
                        cancellationReason,
                        isAccessAvailable: isAccessAvailable ?? job.isAccessAvailable,
                        arrivalWindowStart: arrivalWindowStart ? new Date(arrivalWindowStart) : job.arrivalWindowStart,
                        arrivalWindowEnd: arrivalWindowEnd ? new Date(arrivalWindowEnd) : job.arrivalWindowEnd,
                        timerStartedAt: ((targetStatus === 'IN_PROGRESS' || targetStatus === 'ON_SITE') && !job.timerStartedAt) ? now : job.timerStartedAt,
                        arrival_confirmed_at: (targetStatus === 'ON_SITE' && !job.arrival_confirmed_at) ? now : job.arrival_confirmed_at,
                        scheduledAt: scheduledAt ? new Date(scheduledAt) : job.scheduledAt,
                        // If rescheduling from RESCHEDULE_REQUIRED to BOOKED (or directly to WAITING_FOR_DISPATCH)
                        ...((targetStatus === 'BOOKED' || targetStatus === 'WAITING_FOR_DISPATCH') && currentStatus === 'RESCHEDULE_REQUIRED' ? {
                            offeredToId: null,
                            offeredAt: null,
                            triedProviderIds: null,
                        } : {}),

                        // Update completion evidence
                        ...(targetStatus === 'COMPLETED' ? {
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
                        ...(targetStatus === 'DISPUTED' && userRole === 'CUSTOMER' ? {
                            disputeReason: reason || 'No reason provided',
                            disputeNotes: disputeNotes || null,
                            disputePhotos: disputePhotos || null,
                            disputedAt: now,
                        } : {}),

                        // Update dispute resolution if admin is resolving
                        ...(targetStatus === 'CLOSED' && job.status === 'DISPUTED' && userRole === 'ADMIN' ? {
                            disputeResolvedAt: now,
                            disputeResolution: reason || 'Resolved by admin',
                        } : {}),
                    }
                });
                status = targetStatus;
            }

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
