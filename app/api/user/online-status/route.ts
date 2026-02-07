import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

/**
 * Toggle provider online/offline status
 * POST: { isOnline: boolean }
 */
export async function POST(request: Request) {
    try {
        const cookieStore = await cookies();
        const userId = cookieStore.get('userId')?.value;
        const userRole = cookieStore.get('userRole')?.value;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (userRole !== 'PROVIDER') {
            return NextResponse.json({ error: 'Only providers can toggle online status' }, { status: 403 });
        }

        const body = await request.json();
        const { isOnline } = body;

        if (typeof isOnline !== 'boolean') {
            return NextResponse.json({ error: 'isOnline must be a boolean' }, { status: 400 });
        }

        const updated = await prisma.user.update({
            where: { id: userId },
            data: { isOnline }
        });

        return NextResponse.json({ 
            success: true, 
            isOnline: updated.isOnline,
            message: isOnline ? 'You are now online and will receive job offers' : 'You are now offline and will not receive new job offers'
        });

    } catch (error) {
        console.error('Toggle online status error', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

