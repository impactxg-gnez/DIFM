import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/** POST /api/admin/pending-reviews — create a new pending review lead */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            raw_input,
            detected_job,
            parsed_entities,
            quantity,
            estimated_minutes,
            confidence_score,
            inferred_category,
            confidence_label,
            parser_stage_used,
            blocked_reason,
            user_name,
            email,
            phone,
            notes,
            uploaded_photos,
            location,
            latitude,
            longitude,
        } = body;

        if (!raw_input || !user_name || !email || !phone) {
            return NextResponse.json(
                { error: 'raw_input, user_name, email, and phone are required' },
                { status: 400 },
            );
        }
        if (!location || !String(location).trim()) {
            return NextResponse.json(
                { error: 'location is required' },
                { status: 400 },
            );
        }

        const record = await prisma.pendingReview.create({
            data: {
                raw_input: String(raw_input),
                detected_job: detected_job ? String(detected_job) : null,
                parsed_entities: parsed_entities ?? undefined,
                quantity: Number(quantity) || 1,
                estimated_minutes: Number(estimated_minutes) || 0,
                confidence_score: Number(confidence_score) || 0,
                inferred_category: inferred_category != null ? String(inferred_category) : null,
                confidence_label: confidence_label != null ? String(confidence_label) : null,
                parser_stage_used: parser_stage_used != null ? String(parser_stage_used) : null,
                blocked_reason: blocked_reason != null ? String(blocked_reason) : null,
                user_name: String(user_name),
                email: String(email),
                phone: String(phone),
                notes: notes ? String(notes) : null,
                uploaded_photos: uploaded_photos ? String(uploaded_photos) : null,
                location: String(location).trim(),
                latitude: latitude != null && Number.isFinite(Number(latitude)) ? Number(latitude) : null,
                longitude: longitude != null && Number.isFinite(Number(longitude)) ? Number(longitude) : null,
                review_status: 'NEW',
            },
        });

        return NextResponse.json({ success: true, id: record.id, request_id: record.request_id });
    } catch (err) {
        console.error('[pending-reviews POST]', err);
        return NextResponse.json({ error: 'Failed to create pending review' }, { status: 500 });
    }
}

/** GET /api/admin/pending-reviews — list all (admin only) */
export async function GET() {
    try {
        const records = await prisma.pendingReview.findMany({
            orderBy: { createdAt: 'desc' },
        });
        return NextResponse.json(records);
    } catch (err) {
        console.error('[pending-reviews GET]', err);
        return NextResponse.json({ error: 'Failed to fetch pending reviews' }, { status: 500 });
    }
}
