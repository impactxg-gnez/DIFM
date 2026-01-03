import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    const cookieStore = await cookies();
    const role = cookieStore.get('userRole')?.value;
    const userId = cookieStore.get('userId')?.value;
    if (role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { fixedPrice, platformFeeOverride, providerId, reason } = await request.json();

    if (fixedPrice !== undefined && typeof fixedPrice !== 'number') {
        return NextResponse.json({ error: 'fixedPrice must be number' }, { status: 400 });
    }

    if (platformFeeOverride !== undefined && typeof platformFeeOverride !== 'number') {
        return NextResponse.json({ error: 'platformFeeOverride must be number' }, { status: 400 });
    }

    if ((fixedPrice !== undefined || platformFeeOverride !== undefined) && (!reason || reason.trim().length === 0)) {
        return NextResponse.json({ error: 'Reason required for financial overrides' }, { status: 400 });
    }

    const updates: any = {};
    if (fixedPrice !== undefined) {
        updates.fixedPrice = fixedPrice;
        updates.priceOverride = fixedPrice;
    }
    if (platformFeeOverride !== undefined) {
        updates.platformFeeOverride = platformFeeOverride;
    }
    if (providerId) updates.providerId = providerId;

    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    try {
        const result = await prisma.$transaction(async (tx) => {
            const job = await tx.job.findUnique({ where: { id } });
            if (!job) {
                throw new Error('Job not found');
            }

            // Admin can override price at any job status (before or after provider acceptance)
            // No restrictions - admin has full control

            const updated = await tx.job.update({
                where: { id },
                data: updates,
            });

            if (fixedPrice !== undefined) {
                // Only create override record if price actually changed
                if (job.fixedPrice !== fixedPrice) {
                    await tx.priceOverride.create({
                        data: {
                            jobId: id,
                            oldPrice: job.fixedPrice,
                            newPrice: fixedPrice,
                            reason,
                            changedById: userId || undefined,
                            changedByRole: role,
                        },
                    });
                }
            }

            // Create AuditLog for all override actions
            const details = [];
            if (fixedPrice !== undefined) details.push(`Price: £${job.fixedPrice} → £${fixedPrice}`);
            if (platformFeeOverride !== undefined) details.push(`Platform Fee Override: £${platformFeeOverride}`);
            if (providerId) details.push(`Provider reassigned to: ${providerId}`);

            await tx.auditLog.create({
                data: {
                    action: 'JOB_OVERRIDE',
                    entityId: id,
                    entityType: 'JOB',
                    details: `${details.join(', ')}. Reason: ${reason || 'No reason provided'}`,
                    actorId: userId || 'UNKNOWN'
                }
            });

            return updated;
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

