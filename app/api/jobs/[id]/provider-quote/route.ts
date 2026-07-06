import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';

/** POST /api/jobs/[id]/provider-quote — provider submits a bid on a commercial bulk job */
export async function POST(
    request: Request,
    props: { params: Promise<{ id: string }> },
) {
    try {
        const cookieStore = await cookies();
        const userId = cookieStore.get('userId')?.value;
        const role = cookieStore.get('userRole')?.value;
        if (!userId || role !== 'PROVIDER') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { id: jobId } = await props.params;
        const body = await request.json();
        const quotedPrice = Number(body.quoted_price);
        const notes = body.notes ? String(body.notes) : null;

        if (!Number.isFinite(quotedPrice) || quotedPrice <= 0) {
            return NextResponse.json({ error: 'quoted_price must be a positive number' }, { status: 400 });
        }

        const provider = await prisma.user.findUnique({ where: { id: userId } });
        if (!provider || provider.providerStatus !== 'ACTIVE') {
            return NextResponse.json({ error: 'Provider is not active' }, { status: 403 });
        }

        const job = await prisma.job.findUnique({ where: { id: jobId } });
        if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        if (job.status !== 'COLLECTING_QUOTES') {
            return NextResponse.json({ error: 'This job is not accepting provider quotes' }, { status: 409 });
        }

        const offered = job.offeredToIds ?? [];
        if (offered.length > 0 && !offered.includes(userId)) {
            return NextResponse.json({ error: 'You are not eligible to quote on this job' }, { status: 403 });
        }

        const quote = await prisma.providerQuote.upsert({
            where: {
                jobId_providerId: { jobId, providerId: userId },
            },
            create: {
                jobId,
                providerId: userId,
                quotedPrice,
                notes,
                status: 'PENDING',
            },
            update: {
                quotedPrice,
                notes,
                status: 'PENDING',
            },
            include: {
                provider: { select: { id: true, name: true, email: true } },
            },
        });

        return NextResponse.json({ success: true, quote });
    } catch (err) {
        console.error('[provider-quote POST]', err);
        return NextResponse.json({ error: 'Failed to submit quote' }, { status: 500 });
    }
}

/** GET /api/jobs/[id]/provider-quote — list provider quotes (admin) */
export async function GET(
    _request: Request,
    props: { params: Promise<{ id: string }> },
) {
    try {
        const cookieStore = await cookies();
        const role = cookieStore.get('userRole')?.value;
        if (role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { id: jobId } = await props.params;
        const quotes = await prisma.providerQuote.findMany({
            where: { jobId },
            include: {
                provider: { select: { id: true, name: true, email: true, providerType: true } },
            },
            orderBy: { quotedPrice: 'asc' },
        });

        return NextResponse.json(quotes);
    } catch (err) {
        console.error('[provider-quote GET]', err);
        return NextResponse.json({ error: 'Failed to fetch quotes' }, { status: 500 });
    }
}
