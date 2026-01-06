
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

export async function GET() {
    try {
        const cookieStore = await cookies();
        const userRole = cookieStore.get('userRole')?.value;

        if (userRole !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const disputedJobs = await prisma.job.findMany({
            where: {
                status: 'DISPUTED'
            },
            include: {
                customer: {
                    select: { name: true, email: true }
                },
                provider: {
                    select: { name: true, email: true }
                },
                stateChanges: {
                    where: { toStatus: 'DISPUTED' },
                    orderBy: { createdAt: 'desc' },
                    take: 1
                }
            },
            orderBy: { statusUpdatedAt: 'desc' }
        });

        return NextResponse.json(disputedJobs);

    } catch (error) {
        console.error('Get disputes error', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
