import { excelSource } from './excelLoader';
import { parseJobDescription } from './jobParser';
import { buildVisits, GeneratedVisit } from './visitEngine';

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

    // 2. Load Data from Excel (Runtime cache)
    // const catalogue = Array.from(excelSource.jobItems.values()); // No longer used
    // const phraseMappings = excelSource.phraseMappings; // No longer used

    // 3. Parse Description using V1 Rule-Based Detection (Job_Item_Rules)
    const parseResult = await parseJobDescription(description, excelSource.jobItemRules);

    if (parseResult.detectedItemIds.length === 0) {
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

    // 4. Build Visits (Capability-Aware Summation & Split)
    const visits = buildVisits(parseResult.detectedItemIds);

    // 5. Final Aggregation
    const totalPrice = visits.reduce((sum, v) => sum + v.price, 0);

    // Determination of Primary Category
    let primaryCategory = 'HANDYMAN';
    if (visits.length > 0) {
        const first = visits[0];
        if (first.required_capability_tags.includes('PLUMBING')) primaryCategory = 'PLUMBER';
        else if (first.required_capability_tags.includes('ELECTRICAL')) primaryCategory = 'ELECTRICIAN';
        else if (first.item_class === 'CLEANING') primaryCategory = 'CLEANING';
        else if (first.item_class === 'SPECIALIST') primaryCategory = 'SPECIALIST';
    }

    // 6. Clarifier Binding (Excel-Driven)
    const allClarifierIds = new Set<string>();
    parseResult.detectedItemIds.forEach((id: string) => {
        const item = excelSource.jobItems.get(id);
        if (item?.clarifier_ids) {
            item.clarifier_ids.forEach((cId: string) => allClarifierIds.add(cId));
        }
    });

    const clarifiers = Array.from(allClarifierIds).map(id => ({
        tag: id,
        question: excelSource.clarifierLibrary.get(id) || `Please provide details for ${id}`
    }));

    return {
        visits,
        totalPrice,
        confidence: parseResult.confidence,
        primaryCategory,
        warnings: [],
        clarifiers
    };
}
