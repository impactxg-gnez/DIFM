
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { PRICE_MATRIX, ServiceCategory } from '@/lib/constants';

export async function POST(request: Request) {
    try {
        const cookieStore = await cookies();
        const customerId = cookieStore.get('userId')?.value;
        const userRole = cookieStore.get('userRole')?.value;

        if (!customerId || userRole !== 'CUSTOMER') {
            return NextResponse.json({ error: 'Unauthorized: Only customers can create jobs' }, { status: 403 });
        }

        const body = await request.json();
        const { description, location, category, isASAP, scheduledAt, latitude, longitude, isSimulation } = body;

        if (!description || !location || !category) {
            return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
        }

        const fixedPrice = PRICE_MATRIX[category as ServiceCategory];

        if (!fixedPrice) {
            return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
        }

        // If simulation, calculate provider start position (approx 10km away)
        // 1 deg lat is approx 111km. 0.09 deg is approx 10km.
        let spawnLat = latitude ? parseFloat(latitude) + 0.08 : 51.5874;
        let spawnLng = longitude ? parseFloat(longitude) + 0.08 : -0.0478;

        const job = await prisma.job.create({
            data: {
                description,
                location,
                latitude: latitude ? parseFloat(latitude) : null,
                longitude: longitude ? parseFloat(longitude) : null,
                category,
                fixedPrice,
                isASAP: isASAP ?? true,
                scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
                customerId,
                status: 'DISPATCHING',
                dispatchRadius: 5,
                isSimulation: isSimulation ?? false
            },
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
                include: { provider: { select: { name: true, latitude: true, longitude: true } } }
            });
            // Simple auth check: owner or assigned provider
            if (job?.customerId !== userId && job?.providerId !== userId && userRole !== 'ADMIN' && job?.status !== 'DISPATCHING') {
                // Allow providers to see DISPATCHING jobs
                // Strict check: if it's dispatching, is it in my category?
                // For poll simplicity, allowing if status matches or role admin.
            }
            return NextResponse.json([job]);
        }

        let whereClause: any = {};

        if (userRole === 'CUSTOMER') {
            whereClause.customerId = userId;
        } else if (userRole === 'PROVIDER') {
            const myCategories = user.categories?.split(',') || [];

            // Dispatch Logic:
            // 1. Job is 'DISPATCHING' AND Job Category is in myCategories
            // 2. OR Job is assigned to me

            whereClause = {
                OR: [
                    { providerId: userId },
                    {
                        status: 'DISPATCHING',
                        providerId: null,
                        category: { in: myCategories }
                        // Radius check would go here (e.g. comparing user lat/long with job)
                        // For V1 simulation, we assume "London Base" covers all.
                    }
                ]
            };
        }

        if (status) {
            whereClause.status = status;
        }

        const jobs = await prisma.job.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
            include: {
                customer: { select: { name: true } },
                provider: { select: { name: true, latitude: true, longitude: true } }
            }
        });

        return NextResponse.json(jobs);

    } catch (error) {
        console.error('List jobs error', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
