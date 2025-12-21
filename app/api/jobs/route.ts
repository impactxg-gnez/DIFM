import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
    try {
        const cookieStore = await cookies();
        const customerId = cookieStore.get('userId')?.value;
        const userRole = cookieStore.get('userRole')?.value;

        if (!customerId || userRole !== 'CUSTOMER') { // Strict role check
            return NextResponse.json({ error: 'Unauthorized: Only customers can create jobs' }, { status: 403 });
        }

        const body = await request.json();
        const { description, location, price } = body;

        if (!description || !location || !price) {
            return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
        }

        const job = await prisma.job.create({
            data: {
                description,
                location,
                price: parseFloat(price),
                customerId,
                status: 'CREATED',
                // In a real app, we might trigger a background "Dispatcher" here.
                // For V1, we'll assume it goes to DISPATCHING immediately or via Admin.
                // Let's auto-transition to DISPATCHING for smoother demo flow if "Online".
            },
        });

        // Auto-dispatch for V1 simplicity
        const updatedJob = await prisma.job.update({
            where: { id: job.id },
            data: { status: 'DISPATCHING' }
        });

        return NextResponse.json(updatedJob);

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

        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');

        let whereClause: any = {};

        if (userRole === 'CUSTOMER') {
            // Customers see their own jobs
            whereClause.customerId = userId;
        } else if (userRole === 'PROVIDER') {
            // Providers see:
            // 1. Jobs assigned to them
            // 2. "DISPATCHING" jobs (Available jobs) - Dispatch logic
            // Simple logic: OR condition
            whereClause = {
                OR: [
                    { providerId: userId }, // My jobs
                    { status: 'DISPATCHING', providerId: null } // Open pool
                ]
            };
        } else if (userRole === 'ADMIN') {
            // Admin sees all
        }

        // Filter by status if provided (e.g., polling for status updates)
        if (status) {
            whereClause.status = status;
        }

        const jobs = await prisma.job.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
            include: {
                customer: { select: { name: true } },
                provider: { select: { name: true } }
            }
        });

        return NextResponse.json(jobs);

    } catch (error) {
        console.error('List jobs error', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
