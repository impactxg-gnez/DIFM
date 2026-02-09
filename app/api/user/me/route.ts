import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

export async function GET() {
    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;

    if (!userId) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isOnline: true,
            // Provider-specific fields
            providerStatus: true,
            providerType: true,
            categories: true,
            capabilities: true,
            serviceArea: true,
            latitude: true,
            longitude: true,
        }
    });

    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    return NextResponse.json(user);
}
