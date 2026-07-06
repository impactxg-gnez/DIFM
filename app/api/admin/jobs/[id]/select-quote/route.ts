import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { selectProviderQuote } from '@/lib/admin/customQuoteFulfillment';
import { prisma } from '@/lib/prisma';

/** POST /api/admin/jobs/[id]/select-quote — assign job to provider with best quote */
export async function POST(
    request: Request,
    props: { params: Promise<{ id: string }> },
) {
    try {
        const cookieStore = await cookies();
        const userId = cookieStore.get('userId')?.value;
        const role = cookieStore.get('userRole')?.value;
        if (!userId || role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { id } = await props.params;
        const body = await request.json();
        const { quote_id: quoteId } = body;
        if (!quoteId) {
            return NextResponse.json({ error: 'quote_id is required' }, { status: 400 });
        }

        const job = await selectProviderQuote({
            jobId: id,
            quoteId: String(quoteId),
            adminUserId: userId,
        });

        const fullJob = await prisma.job.findUnique({
            where: { id: job.id },
            include: {
                customer: { select: { name: true } },
                provider: { select: { id: true, name: true } },
                visits: true,
                providerQuotes: {
                    include: { provider: { select: { id: true, name: true, email: true } } },
                    orderBy: { quotedPrice: 'asc' },
                },
            },
        });

        return NextResponse.json({ success: true, job: fullJob });
    } catch (err: any) {
        console.error('[admin select-quote]', err);
        return NextResponse.json({ error: err?.message || 'Failed to select provider quote' }, { status: 500 });
    }
}
