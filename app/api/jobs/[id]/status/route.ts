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
        const { status, reason, completionNotes, partsRequiredAtCompletion, partsNotes, partsPhotos, completionPhotos, disputeNotes, disputePhotos, completionLat, completionLng, completionLocationVerified } = body as {
            status: JobStatus;
            reason?: string;
            completionNotes?: string;
            partsRequiredAtCompletion?: string;
            partsNotes?: string;
            partsPhotos?: string;
            completionPhotos?: string;
            disputeNotes?: string;
            disputePhotos?: string;
            // Milestone 5: Geolocation
            completionLat?: number;
            completionLng?: number;
            completionLocationVerified?: boolean;
        };

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
                throw new Error('Not authorized for this job');
            }

            // Allow customers to dispute completed jobs
            if (userRole === 'CUSTOMER' && status === 'DISPUTED') {
                if (job.customerId !== userId) {
                    throw new Error('Not authorized for this job');
                }
                if (job.status !== 'COMPLETED' && job.status !== 'CUSTOMER_REVIEWED') {
                    throw new Error('Can only dispute completed jobs');
                }
                // Dispute is allowed, will be handled below
            } else if (userRole === 'CUSTOMER' && status !== 'DISPUTED') {
                throw new Error('Customers can only dispute jobs');
            }

            // Require completion notes before COMPLETED status
            if (status === 'COMPLETED' && userRole === 'PROVIDER') {
                if (!completionNotes || !completionNotes.trim()) {
                    throw new Error('Completion notes are required before marking job as complete');
                }

                // For cleaning jobs, parts are always N/A
                // For other jobs, require parts confirmation
                if (job.category === 'CLEANING') {
                    // Cleaners: parts are always N/A, no confirmation needed
                    // Auto-set to N/A if not provided
                } else {
                    // Non-cleaning jobs require parts confirmation
                    if (!partsRequiredAtCompletion || !['YES', 'NO', 'N/A'].includes(partsRequiredAtCompletion)) {
                        throw new Error('Parts confirmation is required (YES/NO/N/A)');
                    }
                }
            }

            const now = new Date();
            const cancellationReason = status.startsWith('CANCELLED') ? (reason || job.cancellationReason || 'Cancelled by admin') : job.cancellationReason;

            const updatedJob = await tx.job.update({
                where: { id },
                data: {
                    status,
                    statusUpdatedAt: now,
                    acceptedAt: status === 'ACCEPTED' ? now : job.acceptedAt,
                    cancellationReason,
                    // Update completion evidence if provided
                    ...(status === 'COMPLETED' && completionNotes ? {
                        completionNotes,
                        completionPhotos: completionPhotos || null,
                        // For cleaning jobs, always set parts to N/A
                        partsRequiredAtCompletion: job.category === 'CLEANING' ? 'N/A' : (partsRequiredAtCompletion || null),
                        partsNotes: job.category === 'CLEANING' ? null : (partsNotes || null),
                        partsPhotos: job.category === 'CLEANING' ? null : (partsPhotos || null),
                        // Milestone 5: Geolocation
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
