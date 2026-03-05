import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';

export async function GET() {
    const cookieStore = await cookies();
    const role = cookieStore.get('userRole')?.value;
    if (role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const logs = await prisma.auditLog.findMany({
        where: {
            action: 'AI_EXTRACTION',
            entityType: 'EXTRACTION',
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
            ...details,
        };
    });

    return NextResponse.json(parsed);
}
