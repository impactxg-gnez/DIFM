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
