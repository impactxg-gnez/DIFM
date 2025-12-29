
export const SERVICE_CATEGORIES = {
    HANDYMAN: 'Handyman',        // ⭐ Primary category
    ELECTRICIAN: 'Electrician',
    PLUMBER: 'Plumber',
    CARPENTER: 'Carpenter',
    CLEANING: 'Cleaning',
    PAINTER: 'Painter',
    PEST_CONTROL: 'Pest Control',
    PC_REPAIR: 'PC Repair'
} as const;

export type ServiceCategory = keyof typeof SERVICE_CATEGORIES;

export const PRICE_MATRIX: Record<ServiceCategory, number> = {
    HANDYMAN: 69,      // H2 standard job (Phase 2)
    ELECTRICIAN: 79,   // E1 small electrical
    PLUMBER: 89,       // P1 quick fix
    CARPENTER: 65,     // Legacy baseline (unused in Phase 2)
    CLEANING: 69,      // C1 standard clean
    PAINTER: 89,       // D1 touch-ups
    PEST_CONTROL: 80,  // Legacy baseline
    PC_REPAIR: 50      // Legacy baseline
};

export const CATEGORY_META: Record<ServiceCategory, {
    icon: string;
    tagline: string;
    featured: boolean;
    color: string;
}> = {
    HANDYMAN: {
        icon: '🔧',
        tagline: 'General repairs & installations',
        featured: true,
        color: 'blue'
    },
    ELECTRICIAN: {
        icon: '⚡',
        tagline: 'Electrical work & installations',
        featured: false,
        color: 'yellow'
    },
    PLUMBER: {
        icon: '🔧',
        tagline: 'Plumbing repairs & installations',
        featured: false,
        color: 'cyan'
    },
    CARPENTER: {
        icon: '🪚',
        tagline: 'Woodwork & carpentry',
        featured: false,
        color: 'amber'
    },
    CLEANING: {
        icon: '✨',
        tagline: 'Professional cleaning services',
        featured: false,
        color: 'green'
    },
    PAINTER: {
        icon: '🎨',
        tagline: 'Painting & decorating',
        featured: false,
        color: 'purple'
    },
    PEST_CONTROL: {
        icon: '🐛',
        tagline: 'Pest removal & prevention',
        featured: false,
        color: 'red'
    },
    PC_REPAIR: {
        icon: '💻',
        tagline: 'Computer repair & support',
        featured: false,
        color: 'indigo'
    }
};

export const CANCELLATION_FEE_PERCENT = 0.20; // 20%
export const PLATFORM_FEE_PERCENT = 0.18; // 18%
