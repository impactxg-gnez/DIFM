import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;

    if (!userId) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { address, apt, label, isDefault } = body;

        // Ensure ownership
        const existing = await prisma.userAddress.findUnique({ where: { id } });
        if (!existing || existing.userId !== userId) {
            return NextResponse.json({ error: 'Not found or not authorized' }, { status: 404 });
        }

        const updated = await prisma.userAddress.update({
            where: { id },
            data: { address, apt, label, isDefault }
        });

        return NextResponse.json(updated);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;

    if (!userId) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        // Ensure ownership
        const existing = await prisma.userAddress.findUnique({ where: { id } });
        if (!existing || existing.userId !== userId) {
            return NextResponse.json({ error: 'Not found or not authorized' }, { status: 404 });
        }

        await prisma.userAddress.delete({
            where: { id }
        });

        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
