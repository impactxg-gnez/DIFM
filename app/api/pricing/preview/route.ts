import { NextResponse } from 'next/server';
import { calculateV1Pricing } from '@/lib/pricing/v1Pricing';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { description } = body;

        if (!description) {
            return NextResponse.json({ error: 'Missing description' }, { status: 400 });
        }

        // V1 Pricing Engine returns visit-first format
        const pricing = await calculateV1Pricing(description);
        
        // Return visit-first contract with warnings and metadata
        return NextResponse.json({
            visits: pricing.visits,
            total_price: pricing.totalPrice,
            warnings: pricing.warnings || [],
            isOutOfScope: pricing.isOutOfScope || false,
            suggestedServices: pricing.suggestedServices || [],
            confidence: pricing.confidence,
            primaryCategory: pricing.primaryCategory
        });
    } catch (error) {
        console.error('Price preview error', error);
        return NextResponse.json({ error: 'Unable to calculate price' }, { status: 500 });
    }
}

