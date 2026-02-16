import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
    try {
        const cookieStore = await cookies();
        const userId = cookieStore.get('userId')?.value;
        const userRole = cookieStore.get('userRole')?.value;

        if (!userId || userRole !== 'CUSTOMER') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const body = await request.json();
        const { jobId, rating, comment } = body;

        const job = await prisma.job.findUnique({ where: { id: jobId } });
        if (!job || job.customerId !== userId) {
            return NextResponse.json({ error: 'Job not found or access denied' }, { status: 403 });
        }

        if (job.status !== 'COMPLETED') {
            return NextResponse.json({ error: 'Job must be COMPLETED to review' }, { status: 400 });
        }

        // Transaction: Create review ONLY (don't change status)
        const review = await prisma.customerReview.create({
            data: {
                jobId,
                customerId: userId,
                providerId: job.providerId!,
                rating: parseInt(rating),
                comment,
            }
        });

        return NextResponse.json(review);

    } catch (error: any) {
        console.error('Customer review error', error);
        return NextResponse.json({
            error: 'Internal Server Error',
            message: error.message
        }, { status: 500 });
    }
}
