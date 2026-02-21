import { getCatalogue } from './catalogue';
import { parseJobDescription } from './jobParser';
import { buildVisits, GeneratedVisit } from './visitEngine';
import { prisma } from '../prisma';

export interface V1PricingResult {
    visits: GeneratedVisit[];
    totalPrice: number;
    confidence: number;
    primaryCategory: string;
    warnings: string[];
    isOutOfScope?: boolean;
    suggestedServices?: string[];
    clarifiers?: any[]; // To be populated from ClarifierLibrary
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
    const isOutOfScope = OUT_OF_SCOPE_KEYWORDS.some(keyword =>
        lower.includes(keyword.toLowerCase())
    );

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

    // 2. Fetch Data (Catalogue + Phrase Mappings)
    const [catalogue, phraseMappings] = await Promise.all([
        getCatalogue(),
        prisma.phraseMapping.findMany()
    ]);

    // 3. Parse Description using V1 Baseline Mapping
    const parseResult = parseJobDescription(description, catalogue, phraseMappings);

    // 4. Resolve detected IDs to full items
    const detectedItems = parseResult.detectedItemIds
        .map((id: string) => catalogue.find((c: any) => c.job_item_id === id))
        .filter((item): item is NonNullable<typeof item> => !!item);

    if (detectedItems.length === 0) {
        return {
            visits: [],
            totalPrice: 0,
            confidence: 0,
            primaryCategory: 'HANDYMAN',
            warnings: ['NEEDS_CLARIFICATION'],
            isOutOfScope: false,
            suggestedServices: SUPPORTED_SERVICES
        };
    }

    // 5. Build Visits (Capability-Aware Summation & Split)
    const visits = buildVisits(detectedItems);

    // 6. Final Aggregation
    const totalPrice = visits.reduce((sum, v) => sum + v.price, 0);

    // Determination of Primary Category based on largest visit or first visit
    let primaryCategory = 'HANDYMAN';
    if (visits.length > 0) {
        const first = visits[0];
        if (first.required_capability_tags.includes('PLUMBING')) primaryCategory = 'PLUMBER';
        else if (first.required_capability_tags.includes('ELECTRICAL')) primaryCategory = 'ELECTRICIAN';
        else if (first.item_class === 'CLEANING') primaryCategory = 'CLEANING';
        else if (first.item_class === 'SPECIALIST') primaryCategory = 'SPECIALIST';
    }

    // 7. Clarifier Binding
    const allClarifierIds = new Set<string>();
    detectedItems.forEach((item: any) => {
        if (item.clarifier_ids) {
            item.clarifier_ids.forEach((id: string) => allClarifierIds.add(id));
        }
    });

    const clarifiers = await prisma.clarifierLibrary.findMany({
        where: {
            tag: { in: Array.from(allClarifierIds) }
        }
    });

    return {
        visits,
        totalPrice,
        confidence: parseResult.confidence,
        primaryCategory,
        warnings: [],
        clarifiers
    };
}
