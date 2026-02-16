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

        // Rule: Parts must be approved or null
        const pendingParts = await prisma.visit.findFirst({
            where: { jobId: jobId, partsStatus: 'PENDING' }
        });
        if (pendingParts) {
            return NextResponse.json({ error: 'Cannot capture payment while parts approval is PENDING.' }, { status: 400 });
        }

        // Rule: No capture if issue is raised
        const issueStates = ['ISSUE_RAISED_BY_CUSTOMER', 'ISSUE_RAISED_BY_PROVIDER', 'RESOLUTION_PENDING'];
        if (issueStates.includes(job.status)) {
            return NextResponse.json({ error: 'Cannot capture payment while an issue is active.' }, { status: 400 });
        }

        // Calculate total approved parts cost
        const visitsWithApprovedParts = await prisma.visit.findMany({
            where: { jobId: jobId, partsStatus: 'APPROVED' }
        });
        const totalPartsCost = visitsWithApprovedParts.reduce((sum, v) => {
            const breakdown = v.partsBreakdown as any;
            return sum + (breakdown?.totalCost || 0);
        }, 0);

        // Simulate successful capture
        // In reality, call Stripe/Payment Gateway here

        const updatedJob = await prisma.$transaction(async (tx) => {
            // Update payment fields on job
            const jobUpdate = await tx.job.update({
                where: { id: jobId },
                data: {
                    customerPaidAt: new Date(),
                    paymentMethod: 'SIMULATED',
                    paymentReference: `CAP-${Math.random().toString(36).substring(7).toUpperCase()}`,
                    partsCost: totalPartsCost // Track parts cost on job
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
