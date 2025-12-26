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

    const { fixedPrice, providerId, reason } = await request.json();

    if (fixedPrice !== undefined && typeof fixedPrice !== 'number') {
        return NextResponse.json({ error: 'fixedPrice must be number' }, { status: 400 });
    }

    if (fixedPrice !== undefined && (!reason || reason.trim().length === 0)) {
        return NextResponse.json({ error: 'Reason required for price override' }, { status: 400 });
    }

    const updates: any = {};
    if (fixedPrice !== undefined) {
        updates.fixedPrice = fixedPrice;
        updates.priceOverride = fixedPrice;
    }
    if (providerId) updates.providerId = providerId;

    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
        const job = await tx.job.findUnique({ where: { id } });
        if (!job) throw new Error('Job not found');

        const updated = await tx.job.update({
            where: { id },
            data: updates,
        });

        if (fixedPrice !== undefined) {
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

        return updated;
    });

    return NextResponse.json(result);
}

