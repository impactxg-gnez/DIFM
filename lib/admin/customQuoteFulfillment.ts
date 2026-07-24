import { prisma } from '@/lib/prisma';
import { broadcastDispatchJob } from '@/lib/dispatch/matcher';

export type AssignmentMode = 'DIRECT' | 'FIND_PROVIDER';

/** Admin-priced jobs skip card pre-auth — provider can begin work immediately. */
export function isAdminPricedJob(reviewType?: string | null): boolean {
    return ['CUSTOM_QUOTE', 'COMMERCIAL_BULK', 'MANUAL_QUOTE'].includes(reviewType ?? '');
}


const NO_LOGIN_HASH = 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f';

function resolveCategory(inferred?: string | null, detected?: string | null): string {
    const raw = (inferred || detected || 'HANDYMAN').toUpperCase().replace(/\s+/g, '_');
    const allowed = [
        'HANDYMAN', 'CLEANING', 'PEST_CONTROL', 'ELECTRICIAN',
        'PLUMBER', 'CARPENTER', 'PAINTER', 'PC_REPAIR',
    ];
    if (allowed.includes(raw)) return raw;
    if (raw.includes('CLEAN')) return 'CLEANING';
    if (raw.includes('PAINT')) return 'PAINTER';
    if (raw.includes('PLUMB')) return 'PLUMBER';
    if (raw.includes('ELECTRIC')) return 'ELECTRICIAN';
    return 'HANDYMAN';
}

async function resolveCustomerId(email: string, name: string): Promise<string> {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return existing.id;

    const created = await prisma.user.create({
        data: {
            email,
            name: name || email.split('@')[0],
            passwordHash: NO_LOGIN_HASH,
            role: 'CUSTOMER',
        },
    });
    return created.id;
}

export async function fulfillPendingReviewAsJob(args: {
    pendingReviewId: string;
    customQuote: number;
    assignmentMode: AssignmentMode;
    providerId?: string | null;
    adminUserId: string;
}) {
    const {
        pendingReviewId,
        customQuote,
        assignmentMode,
        providerId,
        adminUserId,
    } = args;

    if (!Number.isFinite(customQuote) || customQuote <= 0) {
        throw new Error('custom_quote must be a positive number');
    }
    if (assignmentMode === 'DIRECT' && !providerId) {
        throw new Error('provider_id is required for direct assignment');
    }

    const review = await prisma.pendingReview.findUnique({ where: { id: pendingReviewId } });
    if (!review) throw new Error('Pending review not found');
    if (review.job_id) throw new Error('This request already has a linked job');
    if (review.review_status === 'REJECTED') throw new Error('Cannot fulfill a rejected request');
    if (!review.location?.trim()) {
        throw new Error('Customer job location is missing on this request');
    }

    const location = review.location.trim();
    const latitude = review.latitude;
    const longitude = review.longitude;

    const customerId = await resolveCustomerId(review.email, review.user_name);
    const category = resolveCategory(review.inferred_category, review.detected_job);
    const now = new Date();

    if (assignmentMode === 'DIRECT' && providerId) {
        const provider = await prisma.user.findUnique({ where: { id: providerId } });
        if (!provider || provider.role !== 'PROVIDER' || provider.providerStatus !== 'ACTIVE') {
            throw new Error('Selected provider is not active');
        }
    }

    const result = await prisma.$transaction(async (tx) => {
        const job = await tx.job.create({
            data: {
                description: review.raw_input,
                location: location.trim(),
                latitude: latitude ?? null,
                longitude: longitude ?? null,
                category,
                fixedPrice: customQuote,
                isASAP: true,
                customerId,
                status: assignmentMode === 'DIRECT' ? 'PREAUTHORISED' : 'COLLECTING_QUOTES',
                statusUpdatedAt: now,
                needsReview: false,
                isParsed: true,
                reviewType: assignmentMode === 'FIND_PROVIDER' ? 'COMMERCIAL_BULK' : 'CUSTOM_QUOTE',
                reviewPriority: 'HIGH',
                quoteContactEmail: review.email,
                quoteContactPhone: review.phone,
                quoteRequestPhotos: review.uploaded_photos,
                providerId: assignmentMode === 'DIRECT' ? providerId! : null,
                acceptedAt: assignmentMode === 'DIRECT' ? now : null,
                priceOverride: customQuote,
            },
        });

        await tx.jobStateChange.create({
            data: {
                jobId: job.id,
                fromStatus: 'REVIEW_REQUIRED',
                toStatus: assignmentMode === 'DIRECT' ? 'PREAUTHORISED' : 'COLLECTING_QUOTES',
                reason:
                    assignmentMode === 'DIRECT'
                        ? `Admin custom quote £${customQuote} — assigned to provider`
                        : `Admin custom quote £${customQuote} — collecting provider bids`,
                changedById: adminUserId,
                changedByRole: 'ADMIN',
            },
        });

        const updatedReview = await tx.pendingReview.update({
            where: { id: pendingReviewId },
            data: {
                custom_quote: customQuote,
                job_id: job.id,
                assignment_mode: assignmentMode,
                assigned_provider_id: assignmentMode === 'DIRECT' ? providerId! : null,
                review_status: 'FULFILLED',
                notes: review.notes
                    ? `${review.notes} | Admin quote: £${customQuote}`
                    : `Admin quote: £${customQuote}`,
            },
        });

        await tx.auditLog.create({
            data: {
                action: 'CUSTOM_QUOTE_FULFILLED',
                entityType: 'JOB',
                entityId: job.id,
                details: JSON.stringify({
                    pending_review_id: pendingReviewId,
                    assignment_mode: assignmentMode,
                    custom_quote: customQuote,
                    provider_id: providerId ?? null,
                }),
                actorId: adminUserId,
            },
        });

        return { job, review: updatedReview };
    });

    if (assignmentMode === 'FIND_PROVIDER') {
        try {
            await broadcastDispatchJob(result.job.id);
        } catch (e) {
            console.error('[customQuoteFulfillment] broadcast failed', e);
        }
    }

    return result;
}

export async function fulfillReviewRequiredJob(args: {
    jobId: string;
    customQuote: number;
    assignmentMode: AssignmentMode;
    providerId?: string | null;
    adminUserId: string;
}) {
    const { jobId, customQuote, assignmentMode, providerId, adminUserId } = args;

    if (!Number.isFinite(customQuote) || customQuote <= 0) {
        throw new Error('custom_quote must be a positive number');
    }
    if (assignmentMode === 'DIRECT' && !providerId) {
        throw new Error('provider_id is required for direct assignment');
    }

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new Error('Job not found');
    if (job.status !== 'REVIEW_REQUIRED') {
        throw new Error('Job is not awaiting custom quote review');
    }
    if (!job.location?.trim()) {
        throw new Error('Customer job location is missing on this job');
    }

    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
        const nextStatus = assignmentMode === 'DIRECT' ? 'PREAUTHORISED' : 'COLLECTING_QUOTES';
        const updatedJob = await tx.job.update({
            where: { id: jobId },
            data: {
                fixedPrice: customQuote,
                priceOverride: customQuote,
                status: nextStatus,
                statusUpdatedAt: now,
                needsReview: false,
                reviewType: assignmentMode === 'FIND_PROVIDER' ? 'COMMERCIAL_BULK' : 'CUSTOM_QUOTE',
                providerId: assignmentMode === 'DIRECT' ? providerId! : null,
                acceptedAt: assignmentMode === 'DIRECT' ? now : null,
            },
        });

        await tx.jobStateChange.create({
            data: {
                jobId,
                fromStatus: 'REVIEW_REQUIRED',
                toStatus: nextStatus,
                reason:
                    assignmentMode === 'DIRECT'
                        ? `Admin custom quote £${customQuote} — assigned to provider`
                        : `Admin custom quote £${customQuote} — collecting provider bids`,
                changedById: adminUserId,
                changedByRole: 'ADMIN',
            },
        });

        await tx.auditLog.create({
            data: {
                action: 'CUSTOM_QUOTE_FULFILLED',
                entityType: 'JOB',
                entityId: jobId,
                details: JSON.stringify({
                    assignment_mode: assignmentMode,
                    custom_quote: customQuote,
                    provider_id: providerId ?? null,
                }),
                actorId: adminUserId,
            },
        });

        return updatedJob;
    });

    if (assignmentMode === 'FIND_PROVIDER') {
        try {
            await broadcastDispatchJob(jobId);
        } catch (e) {
            console.error('[customQuoteFulfillment] broadcast failed', e);
        }
    }

    return updated;
}

export async function selectProviderQuote(args: {
    jobId: string;
    quoteId: string;
    adminUserId: string;
}) {
    const { jobId, quoteId, adminUserId } = args;

    const quote = await prisma.providerQuote.findUnique({
        where: { id: quoteId },
        include: { provider: true },
    });
    if (!quote || quote.jobId !== jobId) throw new Error('Provider quote not found');
    if (quote.status !== 'PENDING') throw new Error('Quote is no longer selectable');

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new Error('Job not found');
    if (job.status !== 'COLLECTING_QUOTES') {
        throw new Error('Job is not collecting provider quotes');
    }

    const now = new Date();

    return prisma.$transaction(async (tx) => {
        await tx.providerQuote.updateMany({
            where: { jobId, id: { not: quoteId } },
            data: { status: 'REJECTED' },
        });

        await tx.providerQuote.update({
            where: { id: quoteId },
            data: { status: 'SELECTED' },
        });

        const updatedJob = await tx.job.update({
            where: { id: jobId },
            data: {
                providerId: quote.providerId,
                fixedPrice: quote.quotedPrice,
                priceOverride: quote.quotedPrice,
                status: 'PREAUTHORISED',
                statusUpdatedAt: now,
                acceptedAt: now,
            },
        });

        await tx.jobStateChange.create({
            data: {
                jobId,
                fromStatus: 'COLLECTING_QUOTES',
                toStatus: 'PREAUTHORISED',
                reason: `Admin selected quote from ${quote.provider.name} — £${quote.quotedPrice}`,
                changedById: adminUserId,
                changedByRole: 'ADMIN',
            },
        });

        await tx.auditLog.create({
            data: {
                action: 'PROVIDER_QUOTE_SELECTED',
                entityType: 'JOB',
                entityId: jobId,
                details: JSON.stringify({
                    quote_id: quoteId,
                    provider_id: quote.providerId,
                    quoted_price: quote.quotedPrice,
                }),
                actorId: adminUserId,
            },
        });

        return updatedJob;
    });
}
