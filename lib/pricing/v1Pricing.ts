import { getCatalogue } from './catalogue';
import { parseJobDescription } from './jobParser';
import { buildVisits, GeneratedVisit } from './visitEngine';

export interface V1PricingResult {
    visits: GeneratedVisit[];
    totalPrice: number; // Sum of visits
    confidence: number;
    primaryCategory: string;
    warnings: string[];
}

export async function calculateV1Pricing(description: string): Promise<V1PricingResult> {
    // 1. Get Catalogue
    const catalogue = await getCatalogue();

    // 2. Parse Text
    const parseResult = parseJobDescription(description, catalogue);

    // 3. Map detected IDs to Items
    const detectedItems = parseResult.detectedItemIds
        .map(id => catalogue.find(c => c.job_item_id === id))
        .filter(Boolean) as any[]; // cast to simplify TS for now

    // 4. Generate Visits
    const visits = buildVisits(detectedItems);

    // 5. Aggregate
    const totalPrice = visits.reduce((sum, v) => sum + v.price, 0);

    // 6. Determine Primary Category
    // Heuristic: First visit's class or capabilities
    let primaryCategory = 'HANDYMAN';
    if (visits.length > 0) {
        const v = visits[0];
        if (v.itemClass === 'CLEANING') primaryCategory = 'CLEANING';
        else if (v.itemClass === 'SPECIALIST') {
            primaryCategory = 'SPECIALIST';
        } else {
            // STANDARD
            if (v.capabilityTags.includes('PLUMBING')) primaryCategory = 'PLUMBER';
            else if (v.capabilityTags.includes('ELECTRICAL')) primaryCategory = 'ELECTRICIAN';
            else if (v.capabilityTags.includes('PAINTER')) primaryCategory = 'PAINTER';
        }
    }

    return {
        visits,
        totalPrice,
        confidence: parseResult.confidence,
        primaryCategory,
        warnings: []
    };
}
