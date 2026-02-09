import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

export async function GET() {
    const cookieStore = await cookies();
    const role = cookieStore.get('userRole')?.value;
    if (role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const providers = await prisma.user.findMany({
        where: { role: 'PROVIDER' },
        select: {
            id: true,
            name: true,
            email: true,
            isOnline: true,
            categories: true,
            latitude: true,
            longitude: true,
            createdAt: true,
            updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(providers);
}

