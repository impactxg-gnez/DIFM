import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

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

        await prisma.job.update({
            where: { id: jobId },
            data: {
                declinedProviderIds: {
                    push: userId
                }
            } as any
        });

        console.log(`[Decline] Provider ${userId} declined job ${jobId}`);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Decline job error', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
