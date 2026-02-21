import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// V1 Catalogue Data
const CATALOGUE_ITEMS = [
    // --- HANDYMAN (STANDARD) ---
    {
        job_item_id: 'tv_mount_standard',
        display_name: 'Mount TV on wall (up to 55")',
        item_class: 'STANDARD',
        capability_tag: 'HANDYMAN',
        default_minutes: 45,
        pricing_ladder: 'STANDARD',
        time_weight_minutes: 45, // Legacy compatibility
        allowed_addon: true,
        uncertainty_prone: true,
        uncertainty_handling: 'BUFFER',
        risk_buffer_minutes: 30,
        notes: 'Studs/solid wall unknown',
        clarifier_ids: ['tv_bracket_check']
    },
    {
        job_item_id: 'cable_concealment',
        display_name: 'Hide cables (Trunking/Behind wall)',
        item_class: 'STANDARD',
        capability_tag: 'HANDYMAN',
        default_minutes: 30,
        pricing_ladder: 'STANDARD',
        time_weight_minutes: 30,
        allowed_addon: true,
        uncertainty_prone: true,
        uncertainty_handling: 'BUFFER',
        risk_buffer_minutes: 15,
    },
    {
        job_item_id: 'wall_hole_fill',
        display_name: 'Fill small holes / Plaster patch',
        item_class: 'STANDARD',
        capability_tag: 'HANDYMAN',
        default_minutes: 15,
        pricing_ladder: 'STANDARD',
        time_weight_minutes: 15,
        allowed_addon: true,
        uncertainty_prone: false,
        uncertainty_handling: 'IGNORE',
        risk_buffer_minutes: 0,
    },
    {
        job_item_id: 'mirror_hang',
        display_name: 'Hang a mirror',
        item_class: 'STANDARD',
        capability_tag: 'HANDYMAN',
        default_minutes: 15,
        pricing_ladder: 'STANDARD',
        time_weight_minutes: 15,
        allowed_addon: true,
        uncertainty_prone: false,
        uncertainty_handling: 'IGNORE',
        risk_buffer_minutes: 0,
    },

    // --- PLUMBING (STANDARD) ---
    {
        job_item_id: 'tap_leak_fix',
        display_name: 'Fix leaking tap',
        item_class: 'STANDARD',
        capability_tag: 'PLUMBING',
        default_minutes: 45,
        pricing_ladder: 'SPECIALIST',
        time_weight_minutes: 45,
        allowed_addon: true,
        uncertainty_prone: true,
        uncertainty_handling: 'BUFFER',
        risk_buffer_minutes: 15
    },

    // --- ELECTRICAL (STANDARD) ---
    {
        job_item_id: 'socket_replace',
        display_name: 'Replace Socket Faceplate',
        item_class: 'STANDARD',
        capability_tag: 'ELECTRICAL',
        default_minutes: 15,
        pricing_ladder: 'SPECIALIST',
        time_weight_minutes: 15,
        allowed_addon: true,
        uncertainty_prone: false,
        uncertainty_handling: 'IGNORE',
        risk_buffer_minutes: 0
    },
];

const PHRASE_MAPPINGS = [
    { phrase: 'tv mount', canonical_job_item_id: 'tv_mount_standard' },
    { phrase: 'mount tv', canonical_job_item_id: 'tv_mount_standard' },
    { phrase: 'hang tv', canonical_job_item_id: 'tv_mount_standard' },
    { phrase: 'hide cables', canonical_job_item_id: 'cable_concealment' },
    { phrase: 'conceal cables', canonical_job_item_id: 'cable_concealment' },
    { phrase: 'fill holes', canonical_job_item_id: 'wall_hole_fill' },
    { phrase: 'fix holes', canonical_job_item_id: 'wall_hole_fill' },
    { phrase: 'hang mirror', canonical_job_item_id: 'mirror_hang' },
    { phrase: 'mount mirror', canonical_job_item_id: 'mirror_hang' },
    { phrase: 'leaking tap', canonical_job_item_id: 'tap_leak_fix' },
    { phrase: 'fix leak', canonical_job_item_id: 'tap_leak_fix' },
    { phrase: 'replace socket', canonical_job_item_id: 'socket_replace' },
    { phrase: 'change light bulb', canonical_job_item_id: 'socket_replace' }, // Simplification for demo
];

const CLARIFIERS = [
    { id: 'tv_bracket_check', tag: 'bracket_provided', question: 'Do you already have the wall bracket for the TV?' }
];

async function main() {
    console.log('Seeding ClarifierLibrary...');
    for (const item of CLARIFIERS) {
        await prisma.clarifierLibrary.upsert({
            where: { tag: item.tag },
            update: item,
            create: item,
        });
    }

    console.log('Seeding CatalogueItems...');
    for (const item of CATALOGUE_ITEMS) {
        await prisma.catalogueItem.upsert({
            where: { job_item_id: item.job_item_id },
            update: item,
            create: item as any,
        });
    }

    console.log('Seeding PhraseMappings...');
    for (const mapping of PHRASE_MAPPINGS) {
        await prisma.phraseMapping.upsert({
            where: { phrase: mapping.phrase },
            update: mapping,
            create: mapping,
        });
    }
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })
