import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

export async function GET() {
    const cookieStore = await cookies();
    const role = cookieStore.get('userRole')?.value;
    if (role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const rules = await prisma.pricingRule.findMany({
        orderBy: { updatedAt: 'desc' },
    });
    return NextResponse.json(rules);
}

export async function POST(request: Request) {
    const cookieStore = await cookies();
    const role = cookieStore.get('userRole')?.value;
    if (role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { id, category, itemType, basePrice, isActive = true } = body;

    if (!category || !itemType || typeof basePrice !== 'number') {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const rule = id
        ? await prisma.pricingRule.update({
            where: { id },
            data: { category, itemType, basePrice, isActive },
        })
        : await prisma.pricingRule.create({
            data: { category, itemType, basePrice, isActive },
        });

    return NextResponse.json(rule);
}

