import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applyStatusChange } from '@/lib/jobStateMachine';
import { cookies } from 'next/headers';

/**
 * Step 7: Payments & Finance - Capture
 * Moves job from COMPLETED to CAPTURED
 */
export async function POST(
    request: Request,
    props: { params: Promise<{ id: string }> }
) {
    const { id: jobId } = await props.params;

    try {
        const cookieStore = await cookies();
        const userId = cookieStore.get('userId')?.value;
        const userRole = cookieStore.get('userRole')?.value;

        if (!userId || (userRole !== 'ADMIN' && userRole !== 'CUSTOMER')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const job = await prisma.job.findUnique({ where: { id: jobId } });

        if (!job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        if (job.status !== 'COMPLETED') {
            return NextResponse.json({ error: `Cannot capture from ${job.status}` }, { status: 400 });
        }

        // Simulate successful capture
        // In reality, call Stripe/Payment Gateway here

        const updatedJob = await prisma.$transaction(async (tx) => {
            // Update payment fields on job
            const jobUpdate = await tx.job.update({
                where: { id: jobId },
                data: {
                    customerPaidAt: new Date(),
                    paymentMethod: 'SIMULATED',
                    paymentReference: `CAP-${Math.random().toString(36).substring(7).toUpperCase()}`
                }
            });

            // Apply status change
            return await applyStatusChange(jobId, 'CAPTURED', {
                reason: 'Payment captured successfully',
                changedById: userId,
                changedByRole: userRole
            });
        });

        return NextResponse.json({ success: true, job: updatedJob });

    } catch (error: any) {
        console.error('Capture error', error);
        return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
    }
}
