import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { applyStatusChange } from '@/lib/jobStateMachine';

/**
 * Milestone 1: Confirm job and lock price
 * Moves job from CREATED to DISPATCHED and locks the price
 */
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const cookieStore = await cookies();
        const userId = cookieStore.get('userId')?.value;
        const userRole = cookieStore.get('userRole')?.value;

        if (!userId || userRole !== 'CUSTOMER') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const result = await prisma.$transaction(async (tx) => {
            const job = await tx.job.findUnique({ where: { id } });
            
            if (!job) {
                throw new Error('Job not found');
            }

            if (job.customerId !== userId) {
                throw new Error('Not authorized for this job');
            }

            if (job.status !== 'CREATED') {
                throw new Error('Job already confirmed or in progress');
            }

            if (job.priceLockedAt) {
                throw new Error('Price already locked');
            }

            const now = new Date();

            // Lock the price
            const updatedJob = await tx.job.update({
                where: { id },
                data: {
                    priceLockedAt: now,
                }
            });

            // Move to DISPATCHED state
            await applyStatusChange(id, 'DISPATCHED', {
                reason: 'Customer confirmed and price locked',
                changedById: userId,
                changedByRole: 'CUSTOMER'
            });

            return updatedJob;
        });

        return NextResponse.json({ success: true, job: result });

    } catch (error: any) {
        console.error('Confirm job error', error);
        const message = error?.message || 'Internal Server Error';
        const statusCode = message.includes('not found') || message.includes('authorized') || message.includes('already') ? 400 : 500;
        return NextResponse.json({ error: message }, { status: statusCode });
    }
}

