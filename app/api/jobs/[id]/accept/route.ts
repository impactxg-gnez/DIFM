import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> } // Next.js 15: props.params is a Promise
) {
    const { id } = await params;

    try {
        const cookieStore = await cookies();
        const providerId = cookieStore.get('userId')?.value;
        const role = cookieStore.get('userRole')?.value;

        if (!providerId || role !== 'PROVIDER') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        try {
            const result = await prisma.$transaction(async (tx) => {
                const job = await tx.job.findUnique({
                    where: { id }
                });

                if (!job) {
                    throw new Error("Job not found");
                }

                if (job.status !== 'DISPATCHED') {
                    throw new Error("Job is no longer available");
                }

                const updatedJob = await tx.job.update({
                    where: { id },
                    data: {
                        status: 'ACCEPTED',
                        statusUpdatedAt: new Date(),
                        providerId,
                        acceptedAt: new Date()
                    }
                });

                await tx.jobStateChange.create({
                    data: {
                        jobId: id,
                        fromStatus: 'DISPATCHED',
                        toStatus: 'ACCEPTED',
                        reason: 'Provider accepted',
                        changedById: providerId,
                        changedByRole: 'PROVIDER'
                    }
                });

                return updatedJob;
            });

            return NextResponse.json(result);

        } catch (e: any) {
            return NextResponse.json({ error: e.message }, { status: 409 });
        }

    } catch (error) {
        console.error('Accept job error', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
