import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: jobId } = await params;
        const cookieStore = await cookies();
        const userId = cookieStore.get('userId')?.value;
        const userRole = cookieStore.get('userRole')?.value;

        // Validate request body
        const body = await request.json();
        const { status } = body;

        if (!status) {
            return NextResponse.json({ error: 'Status required' }, { status: 400 });
        }

        // Role-based State Machine Logic
        const job = await prisma.job.findUnique({ where: { id: jobId } });
        if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

        // PROVIDER Transitions
        if (userRole === 'PROVIDER') {
            if (job.providerId !== userId) return NextResponse.json({ error: 'Not your job' }, { status: 403 });

            if (status === 'IN_PROGRESS' && job.status === 'ACCEPTED') {
                // Valid
            } else if (status === 'COMPLETED' && job.status === 'IN_PROGRESS') {
                // Valid
            } else {
                return NextResponse.json({ error: 'Invalid transition for Provider' }, { status: 400 });
            }
        }
        // ADMIN Transitions
        else if (userRole === 'ADMIN') {
            if (status === 'CLOSED') {
                // Must have both reviews?
                const reviews = await prisma.job.findUnique({
                    where: { id: jobId },
                    include: { customerReview: true, adminReview: true }
                });
                if (!reviews?.customerReview || !reviews?.adminReview) {
                    return NextResponse.json({ error: 'Cannot close: Reviews missing' }, { status: 400 });
                }
            }
            // Admin can force other states too if needed, but keeping strict for now.
        }
        else {
            return NextResponse.json({ error: 'Unauthorized to change status directly' }, { status: 403 });
        }

        const updatedJob = await prisma.job.update({
            where: { id: jobId },
            data: { status: status }
        });

        return NextResponse.json(updatedJob);

    } catch (error) {
        console.error('Job status error', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
