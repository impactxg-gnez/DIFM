
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { calculateV1Pricing } from '@/lib/pricing/v1Pricing';
import { getV1JobCreateRejection, isV1PricingBookable } from '@/lib/pricing/bookingEligibility';
import { computeStuck } from '@/lib/jobStateMachine';
import { ensureDispatchProgress, activateBookedJobs } from '@/lib/dispatch/dispatchTracker';
import { normalizeTier, normalizeJobForUi } from '@/lib/pricing/tierNormalization';

export async function POST(request: Request) {
    try {
        const cookieStore = await cookies();
        const customerId = cookieStore.get('userId')?.value;
        const userRole = cookieStore.get('userRole')?.value;

        if (!customerId || userRole !== 'CUSTOMER') {
            return NextResponse.json({ error: 'Unauthorized: Only customers can create jobs' }, { status: 403 });
        }

        const body = await request.json();
        const {
            description,
            location,
            latitude,
            longitude,
            isSimulation,
            partsExpectedAtBooking,
            flow,
            quotePhotoUrls,
            quoteContactEmail,
            quoteContactPhone,
        } = body as {
            description?: string;
            location?: string;
            latitude?: string;
            longitude?: string;
            isSimulation?: boolean;
            partsExpectedAtBooking?: string;
            flow?: 'fixed' | 'quote';
            quotePhotoUrls?: string[];
            quoteContactEmail?: string;
            quoteContactPhone?: string;
        };

        if (!description || !location) {
            return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
        }

        const pricing = await calculateV1Pricing(description);
        const submissionFlow = flow === 'quote' ? 'quote' : 'fixed';

        // Review / quote path: always persist a real job (no dead end), except out-of-scope.
        if (submissionFlow === 'quote') {
            if (pricing.isOutOfScope) {
                return NextResponse.json(
                    {
                        error: 'OUT_OF_SCOPE',
                        message: pricing.clarifyMessage,
                        useQuoteFlow: false,
                    },
                    { status: 400 },
                );
            }
            const photoList = Array.isArray(quotePhotoUrls) ? quotePhotoUrls.filter((u) => typeof u === 'string' && u.trim()) : [];
            const emailRaw = typeof quoteContactEmail === 'string' ? quoteContactEmail.trim() : '';
            const phoneRaw = typeof quoteContactPhone === 'string' ? quoteContactPhone.trim() : '';
            const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw);
            const phoneDigits = phoneRaw.replace(/\D/g, '');
            const phoneOk = phoneDigits.length >= 8 && phoneDigits.length <= 15;
            if (!emailOk) {
                return NextResponse.json(
                    { error: 'Please provide a valid email address so we can send your quote.' },
                    { status: 400 },
                );
            }
            if (!phoneOk) {
                return NextResponse.json(
                    { error: 'Please provide a valid phone number so we can reach you.' },
                    { status: 400 },
                );
            }
            const now = new Date();
            const created = await prisma.$transaction(async (tx) => {
                const j = await tx.job.create({
                    data: {
                        description,
                        location,
                        latitude: latitude ? parseFloat(latitude) : null,
                        longitude: longitude ? parseFloat(longitude) : null,
                        category: 'HANDYMAN',
                        fixedPrice: 0,
                        isASAP: true,
                        scheduledAt: null,
                        customerId,
                        status: 'REVIEW_REQUIRED',
                        statusUpdatedAt: now,
                        priceLockedAt: null,
                        dispatchRadius: 5,
                        isSimulation: isSimulation ?? false,
                        needsReview: true,
                        isParsed: true,
                        reviewType: 'MANUAL_QUOTE',
                        reviewPriority: 'MEDIUM',
                        quoteRequestPhotos: photoList.length > 0 ? photoList.join(',') : null,
                        quoteContactEmail: emailRaw,
                        quoteContactPhone: phoneRaw,
                    },
                });
                await tx.jobStateChange.create({
                    data: {
                        jobId: j.id,
                        fromStatus: 'REQUESTED',
                        toStatus: 'REVIEW_REQUIRED',
                        reason: 'Quote request — review before pricing',
                        changedById: customerId,
                        changedByRole: 'CUSTOMER',
                    },
                });
                return j;
            });
            return NextResponse.json({
                flow: 'quote',
                jobId: created.id,
                status: 'REVIEW_REQUIRED',
                message:
                    "We'll review your request and get back to you with a confirmed quote.",
            });
        }

        if (!isV1PricingBookable(pricing)) {
            const rejection = getV1JobCreateRejection(pricing);
            return NextResponse.json(rejection, { status: 422 });
        }

        const category = pricing.primaryCategory;
        const now = new Date();

        // If simulation, calculate provider start position (approx 10km away)
        let spawnLat = latitude ? parseFloat(latitude) + 0.08 : 51.5874;
        let spawnLng = longitude ? parseFloat(longitude) + 0.08 : -0.0478;

        const job = await prisma.$transaction(async (tx) => {
            const createdJob = await tx.job.create({
                data: {
                    description,
                    location,
                    latitude: latitude ? parseFloat(latitude) : null,
                    longitude: longitude ? parseFloat(longitude) : null,
                    category,
                    fixedPrice: pricing.totalPrice,
                    isASAP: true,
                    scheduledAt: null,
                    customerId,
                    status: 'PRICED',
                    statusUpdatedAt: now,
                    priceLockedAt: null, // Price locks AFTER Scope Lock in V1
                    dispatchRadius: 5,
                    isSimulation: isSimulation ?? false,
                    needsReview: pricing.confidence < 0.7,
                    isParsed: true,
                    requiredCapability: pricing.visits[0]?.required_capability_tags?.[0] || null,
                },
            });

            await tx.jobStateChange.create({
                data: {
                    jobId: createdJob.id,
                    fromStatus: 'REQUESTED',
                    toStatus: 'PRICED',
                    reason: 'Instant price generated',
                    changedById: customerId,
                    changedByRole: 'CUSTOMER',
                },
            });

            // V1: Create Visit records (Initially DRAFT)
            for (const v of pricing.visits) {
                await (tx as any).visit.create({
                    data: {
                        jobId: createdJob.id,
                        item_class: v.item_class,
                        primary_job_item_id: v.primary_job_item.job_item_id,
                        addon_job_item_ids: v.addon_job_items.map((a) => a.job_item_id),
                        required_capability_tags_union: v.required_capability_tags,
                        base_minutes: v.total_minutes,
                        effective_minutes: v.total_minutes,
                        tier: v.tier,
                        price: v.price,
                        status: 'DRAFT'
                    }
                });
            }

            // In V1, we don't auto-dispatch yet. We need Scope Lock.

            return createdJob;
        });

        // Fetch persisted visits to attach DB IDs (visit_id)
        const persistedVisits = await (prisma as any).visit.findMany({
            where: { jobId: job.id },
            orderBy: { createdAt: 'asc' }
        });

        // Attach visit_id to the pricing visits in order
        const quoteVisits = pricing.visits.map((v, idx) => ({
            ...v,
            tier: normalizeTier(v?.tier),
            display_price: Number(v?.price ?? 0),
            visit_id: persistedVisits[idx]?.id || ''
        }));

        if (isSimulation) {
            await prisma.user.updateMany({
                where: { email: 'simulator@demo.com' },
                data: { latitude: spawnLat, longitude: spawnLng }
            });
        }

        // 🔒 V1 Contract: Visit-first pricing response (do not return job/price objects)
        return NextResponse.json({
            visits: quoteVisits,
            total_price: pricing.totalPrice,
            display_price: Number(pricing.totalPrice ?? 0),
        });


    } catch (error) {
        const err = error as { code?: string; message?: string };
        console.error('Create job error', err?.message ?? error, err?.code);
        if (err?.code === 'P2022' || /column .+ does not exist/i.test(String(err?.message ?? ''))) {
            console.error(
                '[POST /api/jobs] Database schema may be behind Prisma. Run: npx prisma migrate deploy',
            );
        }
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function GET(request: Request) {
    try {
        const cookieStore = await cookies();
        const userId = cookieStore.get('userId')?.value;
        const userRole = cookieStore.get('userRole')?.value;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // ⏱️ Auto-advance dispatch — must not fail the whole list if dispatch logic errors
        try {
            await activateBookedJobs();
        } catch (e) {
            console.error('[GET /api/jobs] activateBookedJobs failed', e);
        }
        try {
            await ensureDispatchProgress();
        } catch (e) {
            console.error('[GET /api/jobs] ensureDispatchProgress failed', e);
        }

        // Get User to check categories if Provider
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 401 });

        // For providers, also check if they match ASSIGNING jobs (fallback if dispatch didn't set offeredToId)
        let providerMatchesAssigningJobs = false;
        if (userRole === 'PROVIDER' && user.providerStatus === 'ACTIVE' && user.isOnline) {
            providerMatchesAssigningJobs = true;
        }

        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');
        const id = searchParams.get('id');

        // Detail View (polling)
        if (id) {
            const job = await prisma.job.findUnique({
                where: { id },
                include: {
                    provider: { select: { name: true, latitude: true, longitude: true, id: true, providerType: true, complianceConfirmed: true } },
                    items: true,
                    visits: {
                        include: {
                            visitPhotos: true,
                            scopeSummary: true
                        }
                    },
                    stateChanges: { orderBy: { createdAt: 'asc' } },
                    priceOverrides: { orderBy: { createdAt: 'desc' } },
                }
            });
            // Simple auth check: owner or assigned provider
            if (job?.customerId !== userId && job?.providerId !== userId && userRole !== 'ADMIN' && job?.status !== 'ASSIGNING') {
                // Allow providers to see ASSIGNING jobs
                // Strict check: if it's dispatching, is it in my category?
                // For poll simplicity, allowing if status matches or role admin.
            }
            const { isStuck, reason } = computeStuck(job?.status || '', job?.statusUpdatedAt);
            return NextResponse.json([{
                ...normalizeJobForUi(job),
                isStuck,
                stuckReason: reason
            }]);
        }

        let whereClause: any = {};

        if (userRole === 'CUSTOMER') {
            whereClause.customerId = userId;
        } else if (userRole === 'PROVIDER') {
            // Broadcast mode: Provider sees a job if:
            // 1. It is assigned to them (providerId === userId)
            // 2. It is ASSIGNING and matches their category/capabilities (broadcast to all eligible)
            const orConditions: any[] = [
                { providerId: userId },
                { flaggedById: userId }
            ];

            // Sequential mode: Provider only sees ASSIGNING jobs if explicitly offered to them
            if (providerMatchesAssigningJobs) {
                orConditions.push({
                    AND: [
                        { status: 'ASSIGNING' },
                        {
                            OR: [
                                { offeredToId: userId },
                                { offeredToIds: { has: userId } }
                            ]
                        },
                        { NOT: { declinedProviderIds: { has: userId } } }
                    ]
                });

                console.log(`[Jobs API] Provider ${userId} - offering logic (exclusive of declines)`);
            }

            whereClause.OR = orConditions;

            // Debug logging for providers
            console.log(`[Jobs API] Provider ${userId} query: looking for jobs with ${orConditions.length} OR conditions`);
        }

        if (status) {
            whereClause.status = status;
        }

        const rawJobs = await prisma.job.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
            include: {
                customer: { select: { name: true } },
                provider: { select: { id: true, name: true, latitude: true, longitude: true, providerType: true, complianceConfirmed: true } },
                visits: {
                    include: {
                        visitPhotos: true,
                        scopeSummary: true,
                    }
                },
                stateChanges: { orderBy: { createdAt: 'asc' } },
                priceOverrides: { orderBy: { createdAt: 'desc' } },
            }
        });

        // Debug logging for providers
        if (userRole === 'PROVIDER') {
            console.log(`[Jobs API] Provider ${userId} found ${rawJobs.length} jobs`);
            rawJobs.forEach((job: any) => {
                console.log(`[Jobs API] Job ${job.id}: status=${job.status}, offeredToId=${job.offeredToId || 'null'}, providerId=${job.providerId || 'null'}, category=${job.category}`);
            });
        }

        const processedJobs = rawJobs.map((job: any) => {
            const { isStuck, reason } = computeStuck(job.status, job.statusUpdatedAt);

            if (!['ASSIGNED', 'IN_PROGRESS', 'COMPLETED'].includes(job.status)) {
                if (job.provider) {
                    return {
                        ...normalizeJobForUi(job),
                        provider: {
                            id: job.provider.id,
                            name: job.provider.name,
                            latitude: null,
                            longitude: null
                        },
                        isStuck,
                        stuckReason: reason,
                    };
                }
            }
            return { ...normalizeJobForUi(job), isStuck, stuckReason: reason };
        });

        return NextResponse.json(processedJobs);

    } catch (error) {
        const err = error as { code?: string; message?: string; meta?: unknown };
        console.error('List jobs error', err?.message ?? error, err?.code, err?.meta);
        if (err?.code === 'P2022' || /column .+ does not exist/i.test(String(err?.message ?? ''))) {
            console.error(
                '[GET /api/jobs] Database schema may be behind Prisma. Run: npx prisma migrate deploy (also added to npm run build).',
            );
        }
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
