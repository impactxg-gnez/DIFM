import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const visitId = params.id;
        const body = await request.json();
        const { reason, suggestedTier, notes } = body;

        if (!reason || !suggestedTier) {
            return NextResponse.json({ error: 'Missing reason or suggestedTier' }, { status: 400 });
        }

        const visit = await (prisma as any).visit.findUnique({
            where: { id: visitId }
        });

        if (!visit) {
            return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
        }

        // Update visit status to MISMATCH
        await (prisma as any).visit.update({
            where: { id: visitId },
            data: {
                status: 'MISMATCH',
                notes: `Mismatch reported: ${reason}. Suggested: ${suggestedTier}. ${notes || ''}`
            }
        });

        // Notify Customer (In a real app, this would trigger an in-app notification or SMS)
        // For now, we just update the DB.

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Mismatch submission error', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
