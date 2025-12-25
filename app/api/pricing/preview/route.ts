import { NextResponse } from 'next/server';
import { calculateJobPrice } from '@/lib/pricing/calculator';
import { ServiceCategory } from '@/lib/constants';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { category, description, enableParsing = true } = body;

        if (!category || !description) {
            return NextResponse.json({ error: 'Missing category or description' }, { status: 400 });
        }

        const result = await calculateJobPrice(category as ServiceCategory, description, enableParsing);
        return NextResponse.json(result);
    } catch (error) {
        console.error('Price preview error', error);
        return NextResponse.json({ error: 'Unable to calculate price' }, { status: 500 });
    }
}

