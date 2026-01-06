
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { JobStatus } from '@/lib/jobStateMachine';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const cookieStore = await cookies();
        const userRole = cookieStore.get('userRole')?.value;

        if (userRole !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const body = await request.json();
        const { method, reference } = body;

        if (!['MANUAL', 'SIMULATED', 'GATEWAY'].includes(method)) {
            return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 });
        }

        const job = await prisma.job.findUnique({ where: { id } });
        if (!job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        // Create transaction and update job
        const result = await prisma.$transaction(async (tx) => {
            // 1. Create Charge Transaction
            const transaction = await tx.transaction.create({
                data: {
                    jobId: id,
                    amount: job.fixedPrice, // Customer pays full fixed price
                    type: 'CHARGE',
                    status: 'COMPLETED',
                    userId: job.customerId // Charged to customer
                }
            });

            // 2. Update Job Payment Fields
            const updatedJob = await tx.job.update({
                where: { id },
                data: {
                    customerPaidAt: new Date(),
                    paymentMethod: method,
                    paymentReference: reference || `REF-${Math.random().toString(36).substring(7).toUpperCase()}`,
                    // Optionally move to PAID if it was CLOSED? 
                    // For now, we just mark payment. Status transition can be manual or separate.
                }
            });

            // 3. Log Audit
            await tx.auditLog.create({
                data: {
                    action: 'PAYMENT_CAPTURED',
                    entityId: id,
                    entityType: 'JOB',
                    details: `Payment captured via ${method}. Amount: ${job.fixedPrice}`,
                    actorId: 'ADMIN' // or actual admin ID if available
                }
            });

            return { transaction, job: updatedJob };
        });

        return NextResponse.json({ success: true, ...result });

    } catch (error: any) {
        console.error('Payment capture error', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
