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
                // Milestone 2: First-accept locking - use selectForUpdate to prevent race conditions
                const job = await tx.job.findUnique({
                    where: { id }
                });

                if (!job) {
                    throw new Error("Job not found");
                }

                if (job.status !== 'DISPATCHED') {
                    throw new Error("Job is no longer available");
                }

                // Check if provider is ACTIVE
                const provider = await tx.user.findUnique({
                    where: { id: providerId }
                });

                if (!provider || provider.providerStatus !== 'ACTIVE') {
                    throw new Error("Provider account is not active");
                }

                // Milestone 2: Prevent double acceptance - check if already assigned
                if (job.providerId && job.providerId !== providerId) {
                    throw new Error("Job has already been accepted by another provider");
                }

                // Update with conditional check to prevent race conditions
                const updatedJob = await tx.job.updateMany({
                    where: {
                        id,
                        status: 'DISPATCHED',
                        providerId: null // Only update if not already assigned
                    },
                    data: {
                        status: 'ACCEPTED',
                        statusUpdatedAt: new Date(),
                        providerId,
                        acceptedAt: new Date()
                    }
                });

                if (updatedJob.count === 0) {
                    throw new Error("Job was already accepted by another provider");
                }

                // Fetch the updated job
                const jobResult = await tx.job.findUnique({
                    where: { id }
                });

                if (!jobResult) {
                    throw new Error("Failed to fetch updated job");
                }

                await tx.jobStateChange.create({
                    data: {
                        jobId: id,
                        fromStatus: 'DISPATCHED',
                        toStatus: 'ACCEPTED',
                        reason: 'Provider accepted - first-accept lock',
                        changedById: providerId,
                        changedByRole: 'PROVIDER'
                    }
                });

                return jobResult;
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
