import { NextResponse } from 'next/server';
import { calculateV1Pricing } from '@/lib/pricing/v1Pricing';
import { isV1PricingBookable } from '@/lib/pricing/bookingEligibility';
import { normalizeTier } from '@/lib/pricing/tierNormalization';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { description, clarifierAnswers } = body;

        if (!description) {
            return NextResponse.json({ error: 'Missing description' }, { status: 400 });
        }

        // V1 Pricing Engine returns visit-first format
        const pricing = await calculateV1Pricing(description, {
            clarifierAnswers: clarifierAnswers && typeof clarifierAnswers === 'object' ? clarifierAnswers : undefined,
        });
        const bookable = isV1PricingBookable(pricing);

        // Return visit-first contract with warnings and metadata
        return NextResponse.json({
            visits: pricing.visits.map((visit: any) => ({
                ...visit,
                tier: normalizeTier(visit?.tier),
                display_price: Number(visit?.price ?? 0),
            })),
            total_price: pricing.totalPrice,
            display_price: Number(pricing.totalPrice ?? 0),
            warnings: pricing.warnings || [],
            isOutOfScope: pricing.isOutOfScope || false,
            suggestedServices: pricing.suggestedServices || [],
            confidence: pricing.confidence,
            primaryCategory: pricing.primaryCategory,
            clarifyMessage: pricing.clarifyMessage,
            bookable,
            routing: pricing.routing,
            confidenceLevel: pricing.confidenceLevel,
            canSubmitQuoteRequest: pricing.canSubmitQuoteRequest,
            clarifiers: pricing.clarifiers ?? [],
            finalJobs: pricing.finalJobs ?? [],
            quantitiesByJob: pricing.quantitiesByJob ?? {},
            pipeline: pricing.pipeline,
            clarifier_answers: pricing.clarifier_answers ?? {},
            clarifier_hydration: pricing.clarifier_hydration ?? {},
            inferred_values: pricing.clarifier_hydration ?? {},
        });
    } catch (error) {
        console.error('Price preview error', error);
        return NextResponse.json({ error: 'Unable to calculate price' }, { status: 500 });
    }
}

