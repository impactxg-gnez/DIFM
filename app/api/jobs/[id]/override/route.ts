import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

export async function POST(
    request: Request,
    props: { params: Promise<{ id: string }> }
) {
    const { id } = await props.params;

    const cookieStore = await cookies();
    const role = cookieStore.get('userRole')?.value;
    const userId = cookieStore.get('userId')?.value;
    if (role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { providerId, reason } = await request.json();

    const updates: any = {};
    if (providerId) updates.providerId = providerId;

    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: 'Only provider reassignment is allowed via override. Financial overrides are blocked for Anti-Negotiation.' }, { status: 400 });
    }

    try {
        const result = await prisma.$transaction(async (tx) => {
            const job = await tx.job.findUnique({ where: { id } });
            if (!job) {
                throw new Error('Job not found');
            }

            // Admin can override price at any job status (before or after provider acceptance)
            // No restrictions - admin has full control

            const updatedJob = await tx.job.update({
                where: { id },
                data: updates,
            });

            // Create AuditLog for override action
            await tx.auditLog.create({
                data: {
                    action: 'JOB_OVERRIDE',
                    entityId: id,
                    entityType: 'JOB',
                    details: `Provider reassigned to: ${providerId}. Reason: ${reason || 'No reason provided'}`,
                    actorId: userId || 'UNKNOWN'
                }
            });

            return updatedJob;
        });

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Override job error', error);
        return NextResponse.json(
            { error: error.message || 'Failed to override job' },
            { status: 500 }
        );
    }
}

