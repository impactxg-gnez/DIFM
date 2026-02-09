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
            providerStatus: true,
            providerType: true,
            categories: true,
            capabilities: true,
            serviceArea: true,
            latitude: true,
            longitude: true,
            createdAt: true,
            updatedAt: true,
            _count: {
                select: {
                    jobsAssigned: true,
                    documents: true
                }
            }
        },
        orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(providers);
}

