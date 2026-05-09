import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/** PATCH /api/admin/pending-reviews/[id] — update status, quote, provider assignment */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const body = await req.json();
        const { review_status, custom_quote, provider_id, rejection_note } = body;

        const allowed_statuses = ['NEW', 'REVIEWED', 'QUOTED', 'REJECTED'];
        if (review_status && !allowed_statuses.includes(review_status)) {
            return NextResponse.json({ error: 'Invalid review_status' }, { status: 400 });
        }

        const updated = await prisma.pendingReview.update({
            where: { id: params.id },
            data: {
                ...(review_status ? { review_status } : {}),
                ...(custom_quote !== undefined ? { notes: `Quote: £${custom_quote}${rejection_note ? ` | ${rejection_note}` : ''}` } : {}),
            },
        });

        return NextResponse.json({ success: true, record: updated });
    } catch (err) {
        console.error('[pending-reviews PATCH]', err);
        return NextResponse.json({ error: 'Failed to update pending review' }, { status: 500 });
    }
}
