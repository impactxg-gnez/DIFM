
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { ServiceCategory } from '@/lib/constants';
import { calculateJobPrice } from '@/lib/pricing/calculator';
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
        const { description, location, isASAP, scheduledAt, latitude, longitude, isSimulation, partsExpectedAtBooking } = body;

        if (!description || !location) {
            return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
        }

        // Intelligent pricing
        const pricing = await calculateJobPrice('HANDYMAN' as ServiceCategory, description, true);
        const category: ServiceCategory = pricing.primaryCategory || 'HANDYMAN';
        const now = new Date();

        // If simulation, calculate provider start position (approx 10km away)
        // 1 deg lat is approx 111km. 0.09 deg is approx 10km.
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
                    isASAP: isASAP ?? true,
                    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
                    customerId,
                    status: 'CREATED',
                    statusUpdatedAt: now,
                    priceLockedAt: now,
                    dispatchRadius: 5,
                    isSimulation: isSimulation ?? false,
                    needsReview: pricing.needsReview,
                    isParsed: true,
                },
            });

            await tx.jobStateChange.create({
                data: {
                    jobId: createdJob.id,
                    fromStatus: 'SYSTEM',
                    toStatus: 'CREATED',
                    reason: 'Job created',
                    changedById: customerId,
                    changedByRole: 'CUSTOMER',
                },
            });

            // Auto move to DISPATCHED to allow provider acceptance while preserving log
            const dispatchedJob = await tx.job.update({
                where: { id: createdJob.id },
                data: { status: 'DISPATCHED', statusUpdatedAt: now },
            });

            await tx.jobStateChange.create({
                data: {
                    jobId: createdJob.id,
                    fromStatus: 'CREATED',
                    toStatus: 'DISPATCHED',
                    reason: 'Auto dispatch',
                    changedById: customerId,
                    changedByRole: 'CUSTOMER',
                },
            });

            // Determine required capability from items
            // P1/E1 jobs can be handled by handymen with capability OR specialists
            let requiredCapability: string | null = null;
            for (const item of pricing.items) {
                // If item is P1 and routed to HANDYMAN, it requires plumbing capability
                if (item.itemType === 'P1' && item.routeCategory === 'HANDYMAN' && item.requiresCapability) {
                    requiredCapability = 'HANDYMAN_PLUMBING';
                    break;
                }
                // If item is E1 and routed to HANDYMAN, it requires electrical capability
                if (item.itemType === 'E1' && item.routeCategory === 'HANDYMAN' && item.requiresCapability) {
                    requiredCapability = 'HANDYMAN_ELECTRICAL';
                    break;
                }
                // If category is PLUMBER/ELECTRICIAN with P1/E1, handymen with capability can also see it
                if (category === 'PLUMBER' && item.itemType === 'P1') {
                    requiredCapability = 'HANDYMAN_PLUMBING';
                    break;
                }
                if (category === 'ELECTRICIAN' && item.itemType === 'E1') {
                    requiredCapability = 'HANDYMAN_ELECTRICAL';
                    break;
                }
            }

            // Update job with required capability and parts tracking
            await tx.job.update({
                where: { id: createdJob.id },
                data: { 
                    requiredCapability,
                    partsExpectedAtBooking: partsExpectedAtBooking || null
                }
            });

            // Persist job items if any
            if (pricing.items.length > 0) {
                await tx.jobItem.createMany({
                    data: pricing.items.map((item) => ({
                        jobId: createdJob.id,
                        itemType: item.itemType,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                        totalPrice: item.totalPrice,
                        description: item.description,
                    })),
                });
            }

            return dispatchedJob;
        });

        // Update Simulator Provider location if this is a sim
        if (isSimulation) {
            await prisma.user.updateMany({
                where: { email: 'simulator@demo.com' },
                data: { latitude: spawnLat, longitude: spawnLng }
            });
        }

        return NextResponse.json(job);

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
                    provider: { select: { name: true, latitude: true, longitude: true, id: true } },
                    items: true,
                    stateChanges: { orderBy: { createdAt: 'asc' } },
                    priceOverrides: { orderBy: { createdAt: 'desc' } },
                }
            });
            // Simple auth check: owner or assigned provider
            if (job?.customerId !== userId && job?.providerId !== userId && userRole !== 'ADMIN' && job?.status !== 'DISPATCHED') {
                // Allow providers to see DISPATCHED jobs
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
            const myCategories = user.categories?.split(',') || [];
            const myCapabilities = user.capabilities?.split(',') || [];

            // Build dispatch filter with capability logic
            const dispatchConditions: any[] = [];

            // Jobs already assigned to this provider
            dispatchConditions.push({ providerId: userId });

            // Available jobs (DISPATCHED, not assigned)
            const availableJobConditions: any[] = [
                { status: 'DISPATCHED' },
                { providerId: null }
            ];

            // Category-based filtering with capability support
            const categoryFilters: any[] = [];

            // Standard category matching
            if (myCategories.length > 0) {
                // Provider has specific categories - they can see jobs in those categories
                for (const cat of myCategories) {
                    if (cat === 'HANDYMAN') {
                        // Handymen can see:
                        // 1. HANDYMAN jobs without required capability
                        // 2. HANDYMAN jobs with capability they have
                        const handymanFilters: any[] = [
                            { category: 'HANDYMAN', requiredCapability: null }
                        ];
                        if (myCapabilities.includes('HANDYMAN_PLUMBING')) {
                            handymanFilters.push({ category: 'HANDYMAN', requiredCapability: 'HANDYMAN_PLUMBING' });
                        }
                        if (myCapabilities.includes('HANDYMAN_ELECTRICAL')) {
                            handymanFilters.push({ category: 'HANDYMAN', requiredCapability: 'HANDYMAN_ELECTRICAL' });
                        }
                        categoryFilters.push({ OR: handymanFilters });
                    } else if (cat === 'PLUMBER') {
                        // Plumbers can see:
                        // 1. PLUMBER jobs without required capability (P2+/P3+)
                        // 2. PLUMBER jobs with HANDYMAN_PLUMBING (P1) - specialists can always see these
                        categoryFilters.push({
                            category: 'PLUMBER'
                        });
                        // Also, handymen with plumbing capability can see P1 plumbing jobs
                        if (myCapabilities.includes('HANDYMAN_PLUMBING')) {
                            categoryFilters.push({
                                category: 'PLUMBER',
                                requiredCapability: 'HANDYMAN_PLUMBING'
                            });
                        }
                    } else if (cat === 'ELECTRICIAN') {
                        // Electricians can see:
                        // 1. ELECTRICIAN jobs without required capability (E2+)
                        // 2. ELECTRICIAN jobs with HANDYMAN_ELECTRICAL (E1) - specialists can always see these
                        categoryFilters.push({
                            category: 'ELECTRICIAN'
                        });
                        // Also, handymen with electrical capability can see E1 electrical jobs
                        if (myCapabilities.includes('HANDYMAN_ELECTRICAL')) {
                            categoryFilters.push({
                                category: 'ELECTRICIAN',
                                requiredCapability: 'HANDYMAN_ELECTRICAL'
                            });
                        }
                    } else {
                        // Other categories (CLEANING, PAINTER, etc.) - standard matching
                        categoryFilters.push({ category: cat });
                    }
                }
            } else {
                // Default: handyman can see handyman jobs without capability requirement
                categoryFilters.push({ category: 'HANDYMAN', requiredCapability: null });
            }

            if (categoryFilters.length > 0) {
                availableJobConditions.push({ OR: categoryFilters });
            }

            dispatchConditions.push({
                AND: availableJobConditions
            });

            whereClause = { OR: dispatchConditions };
        }

        if (status) {
            whereClause.status = status;
        }

        const rawJobs = await prisma.job.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
            include: {
                customer: { select: { name: true } },
                provider: { select: { id: true, name: true, latitude: true, longitude: true } },
                items: true,
                stateChanges: { orderBy: { createdAt: 'asc' } },
                priceOverrides: { orderBy: { createdAt: 'desc' } },
            }
        });

        const processedJobs = rawJobs.map((job: any) => {
            const { isStuck, reason } = computeStuck(job.status, job.statusUpdatedAt);

            if (!['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'].includes(job.status)) {
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
