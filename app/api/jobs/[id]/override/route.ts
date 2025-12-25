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
    if (role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { fixedPrice, providerId } = await request.json();

    if (fixedPrice !== undefined && typeof fixedPrice !== 'number') {
        return NextResponse.json({ error: 'fixedPrice must be number' }, { status: 400 });
    }

    const updates: any = {};
    if (fixedPrice !== undefined) updates.fixedPrice = fixedPrice;
    if (providerId) updates.providerId = providerId;

    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    const job = await prisma.job.update({
        where: { id },
        data: updates,
    });

    return NextResponse.json(job);
}

