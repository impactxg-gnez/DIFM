import { GeneratedVisit } from './visitEngine';
import { runExtractionPipeline } from './extractionEngine';
import { matchesExtendedOutOfScope } from './bookingGuards';

export interface V1PricingResult {
    visits: GeneratedVisit[];
    totalPrice: number;
    confidence: number;
    primaryCategory: string;
    warnings: string[];
    isOutOfScope?: boolean;
    suggestedServices?: string[];
    clarifiers?: any[];
    /** Human-readable detail when visits are empty (clarify / commercial / partial). */
    clarifyMessage?: string;
}

// Out-of-scope keywords that indicate services we don't offer
const OUT_OF_SCOPE_KEYWORDS = [
    'walk', 'dog', 'pet', 'animal', 'babysit', 'childcare', 'deliver',
    'delivery', 'food', 'grocery', 'shopping', 'drive', 'taxi', 'uber',
    'tutor', 'teach', 'lesson', 'class', 'coach', 'personal trainer',
    'massage', 'therapy', 'counseling', 'legal', 'accountant', 'tax',
    'gardening', 'landscaping', 'mow', 'lawn', 'snow', 'shovel',
    'pet sitting', 'dog walking', 'cat sitting', 'pet care'
];

// Supported service categories for suggestions
const SUPPORTED_SERVICES = [
    'Plumbing', 'Electrical', 'Handyman', 'Cleaning',
    'Painting', 'TV Mounting', 'Carpentry', 'General Repairs'
];

export async function calculateV1Pricing(description: string): Promise<V1PricingResult> {
    const lower = description.toLowerCase();

    // 1. Check for out-of-scope services
    const isOutOfScope =
        OUT_OF_SCOPE_KEYWORDS.some((keyword) => lower.includes(keyword.toLowerCase())) ||
        matchesExtendedOutOfScope(lower);

    if (isOutOfScope) {
        return {
            visits: [],
            totalPrice: 0,
            confidence: 0,
            primaryCategory: 'HANDYMAN',
            warnings: ['OUT_OF_SCOPE'],
            isOutOfScope: true,
            suggestedServices: SUPPORTED_SERVICES
        };
    }

    // 2. Extraction Pipeline:
    // userInput -> GPT-4o extraction -> validated job_item_ids -> fallback deterministic parser
    const extraction = await runExtractionPipeline(description);

    if (extraction.jobs.length === 0) {
        const fromPipeline = extraction.warnings?.length ? extraction.warnings : ['NEEDS_CLARIFICATION'];
        return {
            visits: [],
            totalPrice: 0,
            confidence: 0,
            primaryCategory: 'HANDYMAN',
            warnings: fromPipeline,
            isOutOfScope: false,
            suggestedServices: SUPPORTED_SERVICES,
            clarifiers: extraction.clarifiers,
            clarifyMessage: extraction.message,
        };
    }

    // 3. Build Visits (Capability-aware split for labels/tasks)
    // Backend extraction pipeline already computes the final display price after
    // quantity scaling + complexity escalation + tier resolution.
    const totalPrice = Number(extraction.price ?? 0);
    const visits = extraction.visits.map((visit) => ({
        ...visit,
        // Keep visit/task structure, but ensure single-visit previews render
        // the same backend-final price shown in extraction/admin logs.
        price: extraction.visits.length === 1 ? totalPrice : visit.price,
    }));

    // Determination of Primary Category
    let primaryCategory = 'HANDYMAN';
    if (visits.length > 0) {
        const first = visits[0];
        if (first.required_capability_tags.includes('PLUMBING')) primaryCategory = 'PLUMBER';
        else if (first.required_capability_tags.includes('ELECTRICAL')) primaryCategory = 'ELECTRICIAN';
        else if (first.item_class === 'CLEANING') primaryCategory = 'CLEANING';
        else if (first.item_class === 'SPECIALIST') primaryCategory = 'SPECIALIST';
    }

    // 5. Clarifier Binding (Excel-Driven)
    const mergedWarnings = [...(extraction.warnings ?? [])].filter(Boolean);
    return {
        visits,
        totalPrice,
        confidence: extraction.jobs.length > 0 ? 1 : 0,
        primaryCategory,
        warnings: mergedWarnings,
        clarifiers: extraction.clarifiers,
    };
}
