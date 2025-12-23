
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
    try {
        const cookieStore = await cookies();
        const userId = cookieStore.get('userId')?.value;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { latitude, longitude } = await request.json();

        if (latitude === undefined || longitude === undefined) {
            return NextResponse.json({ error: 'Missing coordinates' }, { status: 400 });
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: {
                latitude: parseFloat(latitude),
                longitude: parseFloat(longitude)
            }
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Update location error', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
