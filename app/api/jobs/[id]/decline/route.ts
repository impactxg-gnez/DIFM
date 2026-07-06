import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { advanceSequentialDispatch, markDispatchExhaustedIfNeeded } from '@/lib/dispatch/matcher';

export async function POST(
    request: Request,
    props: { params: Promise<{ id: string }> }
) {
    try {
        const { id: jobId } = await props.params;
        const cookieStore = await cookies();
        const userId = cookieStore.get('userId')?.value;
        const userRole = cookieStore.get('userRole')?.value;

        if (!userId || userRole !== 'PROVIDER') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const job = await prisma.job.findUnique({ where: { id: jobId } });
        if (!job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        const declined = job.declinedProviderIds ?? [];
        if (!declined.includes(userId)) {
            await prisma.job.update({
                where: { id: jobId },
                data: {
                    declinedProviderIds: { set: [...declined, userId] },
                },
            });
        }

        if (job.status === 'ASSIGNING') {
            try {
                await advanceSequentialDispatch(jobId);
                await markDispatchExhaustedIfNeeded(jobId);
            } catch (dispatchErr) {
                console.error('[Decline] dispatch after decline failed', dispatchErr);
            }
        }

        console.log(`[Decline] Provider ${userId} declined job ${jobId}`);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Decline job error', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
