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
    let detectedItems = parseResult.detectedItemIds
        .map(id => catalogue.find(c => c.job_item_id === id))
        .filter(Boolean) as any[]; // cast to simplify TS for now

    // 4. Fallback: If nothing detected, try intelligent category inference
    if (detectedItems.length === 0) {
        const lower = description.toLowerCase();
        // Plumbing-related keywords
        if (lower.includes('pipe') || lower.includes('plumb') || lower.includes('tap') || 
            lower.includes('faucet') || lower.includes('sink') || lower.includes('water') ||
            lower.includes('leak') || lower.includes('drip') || lower.includes('fixture')) {
            // Try to find tap_leak_fix as fallback
            const fallbackItem = catalogue.find(c => c.job_item_id === 'tap_leak_fix');
            if (fallbackItem) {
                detectedItems = [fallbackItem];
                parseResult.confidence = 0.6; // Lower confidence for fallback
            }
        }
        // Electrical-related keywords
        else if (lower.includes('electr') || lower.includes('socket') || lower.includes('plug') || 
                 lower.includes('switch') || lower.includes('outlet') || lower.includes('wiring')) {
            const fallbackItem = catalogue.find(c => c.job_item_id === 'socket_replace');
            if (fallbackItem) {
                detectedItems = [fallbackItem];
                parseResult.confidence = 0.6;
            }
        }
        // Cleaning-related keywords
        else if (lower.includes('clean') || lower.includes('cleaning')) {
            const fallbackItem = catalogue.find(c => c.job_item_id === 'eot_cleaning_1bed');
            if (fallbackItem) {
                detectedItems = [fallbackItem];
                parseResult.confidence = 0.6;
            }
        }
    }

    // 5. Generate Visits
    const visits = buildVisits(detectedItems);

    // 6. Aggregate
    const totalPrice = visits.reduce((sum, v) => sum + v.price, 0);

    // 7. Determine Primary Category
    let primaryCategory = 'HANDYMAN';
    if (visits.length > 0) {
        const v = visits[0];
        if (v.item_class === 'CLEANING') primaryCategory = 'CLEANING';
        else if (v.item_class === 'SPECIALIST') {
            primaryCategory = 'SPECIALIST';
        } else {
            // STANDARD
            const tags = v.required_capability_tags || [];
            if (tags.includes('PLUMBING')) primaryCategory = 'PLUMBER';
            else if (tags.includes('ELECTRICAL')) primaryCategory = 'ELECTRICIAN';
            else if (tags.includes('PAINTER')) primaryCategory = 'PAINTER';
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
