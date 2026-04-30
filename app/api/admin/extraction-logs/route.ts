import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { normalizeTier } from '@/lib/pricing/tierNormalization';

export async function GET() {
    const cookieStore = await cookies();
    const role = cookieStore.get('userRole')?.value;
    if (role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const logs = await prisma.auditLog.findMany({
        where: {
            OR: [
                { action: 'BOOKING_PIPELINE' },
                // Legacy paths (historical)
                { action: 'AI_EXTRACTION', entityType: 'EXTRACTION' },
                { action: 'MATRIX_V2_PIPELINE', entityType: 'MATRIX_V2_EXTRACTION' },
            ],
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
    });

    const parsed = logs.map((log) => {
        let details: any = {};
        try {
            details = log.details ? JSON.parse(log.details) : {};
        } catch {
            details = { raw: log.details };
        }
        return {
            id: log.id,
            createdAt: log.createdAt,
            audit_action: log.action,
            ...details,
            tier:
                details?.pricing?.tier !== undefined
                    ? normalizeTier(details.pricing.tier)
                    : details?.tier !== undefined
                      ? normalizeTier(details.tier)
                      : details?.tier,
            tier_before: details?.tier_before !== undefined ? normalizeTier(details.tier_before) : details?.tier_before,
            tier_after: details?.tier_after !== undefined ? normalizeTier(details.tier_after) : details?.tier_after,
            display_price: Number(
                details?.display_price ??
                details?.pricing?.price ??
                details?.final_price ??
                details?.price_after ??
                details?.price ??
                details?.totalPrice ??
                0
            ),
        };
    });

    return NextResponse.json(parsed);
}
