import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import {
    fulfillPendingReviewAsJob,
    type AssignmentMode,
} from '@/lib/admin/customQuoteFulfillment';

/** PATCH /api/admin/pending-reviews/[id] — quote, reject, or fulfill as job */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const cookieStore = await cookies();
        const userId = cookieStore.get('userId')?.value;
        const role = cookieStore.get('userRole')?.value;
        if (!userId || role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { id } = await params;
        const body = await req.json();
        const {
            review_status,
            custom_quote,
            rejection_note,
            assignment_mode,
            provider_id,
            location,
            latitude,
            longitude,
        } = body;

        const allowed_statuses = ['NEW', 'REVIEWED', 'QUOTED', 'REJECTED', 'FULFILLED'];
        if (review_status && !allowed_statuses.includes(review_status)) {
            return NextResponse.json({ error: 'Invalid review_status' }, { status: 400 });
        }

        if (review_status === 'REJECTED') {
            const updated = await prisma.pendingReview.update({
                where: { id },
                data: {
                    review_status: 'REJECTED',
                    notes: rejection_note ? String(rejection_note) : undefined,
                },
            });
            return NextResponse.json({ success: true, record: updated });
        }

        const shouldFulfill =
            assignment_mode === 'DIRECT' ||
            assignment_mode === 'FIND_PROVIDER' ||
            review_status === 'FULFILLED';

        if (shouldFulfill) {
            const quote = Number(custom_quote);
            if (!Number.isFinite(quote) || quote <= 0) {
                return NextResponse.json({ error: 'custom_quote is required to fulfill' }, { status: 400 });
            }
            if (!location || !String(location).trim()) {
                return NextResponse.json({ error: 'location is required to create the job' }, { status: 400 });
            }

            const mode = (assignment_mode || 'FIND_PROVIDER') as AssignmentMode;
            const result = await fulfillPendingReviewAsJob({
                pendingReviewId: id,
                customQuote: quote,
                assignmentMode: mode,
                providerId: provider_id ?? null,
                location: String(location),
                latitude: latitude != null ? Number(latitude) : null,
                longitude: longitude != null ? Number(longitude) : null,
                adminUserId: userId,
            });

            return NextResponse.json({
                success: true,
                record: result.review,
                job: await prisma.job.findUnique({
                    where: { id: result.job.id },
                    include: {
                        customer: { select: { name: true } },
                        provider: { select: { id: true, name: true } },
                        visits: true,
                        providerQuotes: {
                            include: { provider: { select: { id: true, name: true, email: true } } },
                            orderBy: { quotedPrice: 'asc' },
                        },
                    },
                }),
            });
        }

        const updated = await prisma.pendingReview.update({
            where: { id },
            data: {
                ...(review_status ? { review_status } : {}),
                ...(custom_quote !== undefined ? { custom_quote: Number(custom_quote) } : {}),
                ...(rejection_note ? { notes: String(rejection_note) } : {}),
            },
        });

        return NextResponse.json({ success: true, record: updated });
    } catch (err: any) {
        console.error('[pending-reviews PATCH]', err);
        return NextResponse.json({ error: err?.message || 'Failed to update pending review' }, { status: 500 });
    }
}
