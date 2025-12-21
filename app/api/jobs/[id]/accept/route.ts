import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> } // Params are promise in Next 15
) {
    try {
        const { id: jobId } = await params;
        const cookieStore = await cookies();
        const providerId = cookieStore.get('userId')?.value;
        const userRole = cookieStore.get('userRole')?.value;

        if (!providerId || userRole !== 'PROVIDER') {
            return NextResponse.json({ error: 'Unauthorized: Only providers can accept jobs' }, { status: 403 });
        }

        // Atomic acceptance using interactive transaction or updateMany with where clause
        // 'updateMany' ensures we only update if it is still null and DISPATCHING
        const result = await prisma.job.updateMany({
            where: {
                id: jobId,
                status: 'DISPATCHING', // Must be in this state
                providerId: null       // Must be unassigned
            },
            data: {
                providerId: providerId,
                status: 'ACCEPTED',
                updatedAt: new Date() // force update
            }
        });

        if (result.count === 0) {
            return NextResponse.json({ error: 'Job already accepted or not available' }, { status: 409 });
        }

        // Fetch the updated job to return
        const updatedJob = await prisma.job.findUnique({
            where: { id: jobId }
        });

        return NextResponse.json(updatedJob);

    } catch (error) {
        console.error('Accept job error', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
