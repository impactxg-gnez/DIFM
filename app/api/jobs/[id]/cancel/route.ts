
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { CANCELLATION_FEE_PERCENT } from '@/lib/constants';
import { canTransition, JobStatus } from '@/lib/jobStateMachine';

export async function POST(
    request: Request,
    props: { params: Promise<{ id: string }> }
) {
    const { id } = await props.params;

    try {
        // Find current status
        const job = await prisma.job.findUnique({
            where: { id }
        });

        if (!job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        if (['COMPLETED', 'CLOSED', 'CANCELLED_FREE', 'CANCELLED_CHARGED'].includes(job.status)) {
            return NextResponse.json({ error: 'Cannot cancel finished job' }, { status: 400 });
        }

        let newStatus: JobStatus = 'CANCELLED_FREE';
        let fee = 0;

        if (job.status === 'ACCEPTED' || job.status === 'IN_PROGRESS') {
            // Late cancellation -> Fee
            newStatus = 'CANCELLED_CHARGED';
            fee = job.fixedPrice * CANCELLATION_FEE_PERCENT;
        }

        if (!canTransition(job.status as JobStatus, newStatus)) {
            return NextResponse.json({ error: 'Invalid transition' }, { status: 400 });
        }

        // Update Job
        await prisma.$transaction(async (tx) => {
            await tx.job.update({
                where: { id },
                data: {
                    status: newStatus,
                    statusUpdatedAt: new Date(),
                    cancellationReason: 'Customer Cancelled'
                }
            });

            await tx.jobStateChange.create({
                data: {
                    jobId: id,
                    fromStatus: job.status,
                    toStatus: newStatus,
                    reason: 'Customer Cancelled',
                    changedById: job.customerId,
                    changedByRole: 'CUSTOMER'
                }
            });

            // If charged, create transaction record for history
            if (fee > 0) {
                await tx.transaction.create({
                    data: {
                        jobId: id,
                        amount: fee,
                        type: 'CHARGE',
                        status: 'PENDING', // To be processed
                        userId: job.customerId
                    }
                });

                // Provider payout for cancellation would be partial (e.g. 50% of cancel fee?)
                // Defined in scope: "Provider get's partial payout"
                // Let's say provider gets 50% of the cancellation charge
                if (job.providerId) {
                    await tx.transaction.create({
                        data: {
                            jobId: id,
                            amount: fee * 0.5,
                            type: 'PAYOUT',
                            status: 'PENDING',
                            userId: job.providerId
                        }
                    });
                }
            }
        });

        return NextResponse.json({ success: true, status: newStatus, fee });

    } catch (error) {
        console.error('Cancel job error', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
