import { getCatalogue } from './catalogue';
import { parseJobDescription } from './jobParser';
import { buildVisits, GeneratedVisit } from './visitEngine';

export interface V1PricingResult {
    visits: GeneratedVisit[];
    totalPrice: number; // Sum of visits
    confidence: number;
    primaryCategory: string;
    warnings: string[];
    isOutOfScope?: boolean; // True if service is not supported
    suggestedServices?: string[]; // Suggested alternative services
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
    
    // Check for out-of-scope services
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

    // 1. Get Catalogue
    const catalogue = await getCatalogue();

    // 2. Parse Text
    const parseResult = parseJobDescription(description, catalogue);

    // 3. Map detected IDs to Items (preserve quantities - duplicates are intentional)
    // parseJobDescription now returns items with quantities as duplicates in the array
    let detectedItems = parseResult.detectedItemIds
        .map(id => catalogue.find(c => c.job_item_id === id))
        .filter(Boolean) as any[]; // cast to simplify TS for now

    // 4. Fallback: If nothing detected, try intelligent category inference
    if (detectedItems.length === 0) {
        // Plumbing-related keywords (including drain/unclog)
        if (lower.includes('pipe') || lower.includes('plumb') || lower.includes('tap') || 
            lower.includes('faucet') || lower.includes('sink') || lower.includes('water') ||
            lower.includes('leak') || lower.includes('drip') || lower.includes('fixture') ||
            lower.includes('drain') || lower.includes('unclog') || lower.includes('clog') ||
            lower.includes('shower') || lower.includes('bath')) {
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
            // Prefer standard apartment cleaning if apartment/flat/room/house is mentioned
            if (lower.includes('apartment') || lower.includes('flat') || lower.includes('room') || lower.includes('house')) {
                const fallbackItem = catalogue.find(c => c.job_item_id === 'apartment_cleaning_standard');
                if (fallbackItem) {
                    detectedItems = [fallbackItem];
                    parseResult.confidence = 0.6;
                }
            } else {
                // Otherwise use EOT cleaning as fallback
                const fallbackItem = catalogue.find(c => c.job_item_id === 'eot_cleaning_1bed');
                if (fallbackItem) {
                    detectedItems = [fallbackItem];
                    parseResult.confidence = 0.6;
                }
            }
        }
    }
    
    // Note: Duplicates are now intentional - they represent quantities
    // The visit generation engine will handle bundling correctly
    
    // 4b. If still no match after fallback, mark as needs clarification
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
