
export const SERVICE_CATEGORIES = {
    HANDYMAN: 'Handyman',
    CLEANING: 'Cleaning',
    PEST_CONTROL: 'Pest Control',
    ELECTRICIAN: 'Electrician',
    PLUMBER: 'Plumber',
    CARPENTER: 'Carpenter',
    PAINTER: 'Painter',
    PC_REPAIR: 'PC Repair'
} as const;

export type ServiceCategory = keyof typeof SERVICE_CATEGORIES;

export const PRICE_MATRIX: Record<ServiceCategory, number> = {
    HANDYMAN: 75,      // Call out + 1hr (most common use case)
    CLEANING: 40,      // Fixed price standard clean
    PEST_CONTROL: 80,  // Standard visit
    ELECTRICIAN: 70,   // Call out + 1hr
    PLUMBER: 80,       // Call out + 1hr
    CARPENTER: 65,     // Hourly rate basis (fixed for V1)
    PAINTER: 200,      // Daily rate basis (fixed for V1)
    PC_REPAIR: 50      // Diagnostic / Simple fix
};

export const CANCELLATION_FEE_PERCENT = 0.20; // 20%
export const PLATFORM_FEE_PERCENT = 0.20; // 20%
