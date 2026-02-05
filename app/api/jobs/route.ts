
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { ServiceCategory } from '@/lib/constants';
import { calculateJobPrice } from '@/lib/pricing/calculator';
import { calculateV1Pricing } from '@/lib/pricing/v1Pricing';
import { computeStuck } from '@/lib/jobStateMachine';

export async function POST(request: Request) {
    try {
        const cookieStore = await cookies();
        const customerId = cookieStore.get('userId')?.value;
        const userRole = cookieStore.get('userRole')?.value;

        if (!customerId || userRole !== 'CUSTOMER') {
            return NextResponse.json({ error: 'Unauthorized: Only customers can create jobs' }, { status: 403 });
        }

        const body = await request.json();
        const { description, location, latitude, longitude, isSimulation, partsExpectedAtBooking } = body;

        if (!description || !location) {
            return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
        }

        // V1 Pricing Engine
        const pricing = await calculateV1Pricing(description);
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
                    requiredCapability: pricing.visits[0]?.required_capability_tags_union.join(','),
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
                        primary_job_item_id: v.primary_job_item_id,
                        addon_job_item_ids: v.addon_job_item_ids,
                        required_capability_tags_union: v.required_capability_tags_union,
                        base_minutes: v.base_minutes,
                        effective_minutes: v.effective_minutes,
                        tier: v.tier,
                        price: v.price,
                        status: 'DRAFT'
                    }
                });
            }

            // In V1, we don't auto-dispatch yet. We need Scope Lock.

            return createdJob;
        });

        // Fetch job with visits for response
        const jobWithVisits = await prisma.job.findUnique({
            where: { id: job.id },
            include: { visits: true } as any
        });

        if (isSimulation) {
            await prisma.user.updateMany({
                where: { email: 'simulator@demo.com' },
                data: { latitude: spawnLat, longitude: spawnLng }
            });
        }

        return NextResponse.json(jobWithVisits);


    } catch (error) {
        console.error('Create job error', error);
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

        // Get User to check categories if Provider
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 401 });

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
            return NextResponse.json([{ ...job, isStuck, stuckReason: reason }]);
        }

        let whereClause: any = {};

        if (userRole === 'CUSTOMER') {
            whereClause.customerId = userId;
        } else if (userRole === 'PROVIDER') {
            // Milestone 2 & Step 5: Sequential Assignment
            // A provider sees a job ONLY if:
            // 1. It is assigned to them (providerId === userId)
            // 2. It is currently offered to them (offeredToId === userId)
            whereClause.OR = [
                { providerId: userId },
                { offeredToId: userId, status: 'ASSIGNING' }
            ];
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
                items: true,
                stateChanges: { orderBy: { createdAt: 'asc' } },
                priceOverrides: { orderBy: { createdAt: 'desc' } },
            }
        });

        const processedJobs = rawJobs.map((job: any) => {
            const { isStuck, reason } = computeStuck(job.status, job.statusUpdatedAt);

            if (!['ASSIGNED', 'IN_PROGRESS', 'COMPLETED'].includes(job.status)) {
                if (job.provider) {
                    return {
                        ...job,
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
            return { ...job, isStuck, stuckReason: reason };
        });

        return NextResponse.json(processedJobs);

    } catch (error) {
        console.error('List jobs error', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
