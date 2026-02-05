import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { applyStatusChange } from '@/lib/jobStateMachine';

export async function POST(
    request: Request,
    props: { params: Promise<{ id: string }> }
) {
    const { id } = await props.params;

    try {
        const cookieStore = await cookies();
        const userId = cookieStore.get('userId')?.value;
        const userRole = cookieStore.get('userRole')?.value;

        if (!userId || userRole !== 'CUSTOMER') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const job = await prisma.job.findUnique({ where: { id } });

        if (!job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        if (job.customerId !== userId) {
            return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
        }

        if (job.status !== 'PRICED') {
            return NextResponse.json({ error: `Cannot book from ${job.status}` }, { status: 400 });
        }

        const updatedJob = await applyStatusChange(id, 'BOOKED', {
            reason: 'Customer clicked Book Now',
            changedById: userId,
            changedByRole: 'CUSTOMER'
        });

        return NextResponse.json({ success: true, job: updatedJob });

    } catch (error: any) {
        console.error('Book job error', error);
        return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
    }
}
