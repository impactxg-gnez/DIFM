
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> } // Next.js 15: props.params is a Promise
) {
    const { id } = await params;

    try {
        const body = await request.json();
        const { providerId } = body;

        // Transaction to ensure race condition safety
        // Only accept if status is DISPATCHING

        try {
            const result = await prisma.$transaction(async (tx) => {
                const job = await tx.job.findUnique({
                    where: { id }
                });

                if (!job) {
                    throw new Error("Job not found");
                }

                if (job.status !== 'DISPATCHING') {
                    throw new Error("Job is no longer available");
                }

                // Lock the job
                const updatedJob = await tx.job.update({
                    where: { id },
                    data: {
                        status: 'ACCEPTED',
                        providerId,
                        acceptedAt: new Date()
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
