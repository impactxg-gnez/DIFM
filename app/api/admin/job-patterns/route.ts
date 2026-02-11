import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

export async function GET() {
    const cookieStore = await cookies();
    const role = cookieStore.get('userRole')?.value;
    if (role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const patterns = await prisma.jobPattern.findMany({
        orderBy: [
            { priority: 'desc' },
            { category: 'asc' },
            { createdAt: 'desc' }
        ],
    });
    
    // Parse keywords JSON strings
    const patternsWithParsedKeywords = patterns.map(p => ({
        ...p,
        keywords: typeof p.keywords === 'string' ? JSON.parse(p.keywords) : p.keywords
    }));
    
    return NextResponse.json(patternsWithParsedKeywords);
}

export async function POST(request: Request) {
    const cookieStore = await cookies();
    const role = cookieStore.get('userRole')?.value;
    if (role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { 
        id, 
        category, 
        keywords, // Array of strings
        catalogueItemId, 
        description, 
        examplePhrases,
        isActive = true,
        priority = 0
    } = body;

    if (!category || !keywords || !Array.isArray(keywords) || !catalogueItemId || !description) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const pattern = id
        ? await prisma.jobPattern.update({
            where: { id },
            data: { 
                category, 
                keywords: JSON.stringify(keywords),
                catalogueItemId, 
                description,
                examplePhrases,
                isActive,
                priority
            },
        })
        : await prisma.jobPattern.create({
            data: { 
                category, 
                keywords: JSON.stringify(keywords),
                catalogueItemId, 
                description,
                examplePhrases,
                isActive,
                priority
            },
        });

    return NextResponse.json({
        ...pattern,
        keywords: typeof pattern.keywords === 'string' ? JSON.parse(pattern.keywords) : pattern.keywords
    });
}

export async function DELETE(request: Request) {
    const cookieStore = await cookies();
    const role = cookieStore.get('userRole')?.value;
    if (role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ error: 'Pattern ID required' }, { status: 400 });
    }

    await prisma.jobPattern.delete({
        where: { id },
    });

    return NextResponse.json({ success: true });
}
