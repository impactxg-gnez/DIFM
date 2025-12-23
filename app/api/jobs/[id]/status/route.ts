
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PLATFORM_FEE_PERCENT } from '@/lib/constants';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const body = await request.json();
        const { status } = body;

        // V2 State transition logic
        // Only allow specific transitions

        await prisma.$transaction(async (tx) => {
            const job = await tx.job.findUnique({ where: { id } });
            if (!job) throw new Error("Job not found");

            // Update status
            await tx.job.update({
                where: { id },
                data: { status }
            });

            // If COMPLETED, calculate payout
            if (status === 'COMPLETED') {
                const price = job.fixedPrice;
                const platformFee = price * PLATFORM_FEE_PERCENT;
                const payout = price - platformFee;

                // Create Payout Transaction
                await tx.transaction.create({
                    data: {
                        jobId: id,
                        amount: payout,
                        type: 'PAYOUT',
                        status: 'PENDING', // Manual execution later
                        userId: job.providerId
                    }
                });

                // Create Fee Record (optional, but good for reporting)
                await tx.transaction.create({
                    data: {
                        jobId: id,
                        amount: platformFee,
                        type: 'FEE',
                        status: 'COMPLETED', // Fee is taken immediately
                        userId: job.providerId // Fee from provider's cut effectively
                    }
                });
            }
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Update status error', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
