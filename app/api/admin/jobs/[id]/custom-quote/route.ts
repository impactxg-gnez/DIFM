import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { fulfillReviewRequiredJob, type AssignmentMode } from '@/lib/admin/customQuoteFulfillment';
import { prisma } from '@/lib/prisma';

/** POST /api/admin/jobs/[id]/custom-quote — fulfill REVIEW_REQUIRED job with admin quote */
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
        const {
            custom_quote,
            assignment_mode,
            provider_id,
            location,
            latitude,
            longitude,
        } = body;

        const quote = Number(custom_quote);
        if (!Number.isFinite(quote) || quote <= 0) {
            return NextResponse.json({ error: 'custom_quote is required' }, { status: 400 });
        }

        const job = await fulfillReviewRequiredJob({
            jobId: id,
            customQuote: quote,
            assignmentMode: (assignment_mode || 'FIND_PROVIDER') as AssignmentMode,
            providerId: provider_id ?? null,
            location: location ?? null,
            latitude: latitude != null ? Number(latitude) : null,
            longitude: longitude != null ? Number(longitude) : null,
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
        console.error('[admin custom-quote]', err);
        return NextResponse.json({ error: err?.message || 'Failed to fulfill custom quote' }, { status: 500 });
    }
}
