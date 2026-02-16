import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// V1 Catalogue Data
const CATALOGUE_ITEMS = [
    // --- HANDYMAN (STANDARD) ---
    {
        job_item_id: 'tv_mount_standard',
        display_name: 'Mount TV on wall (up to 55")',
        item_class: 'STANDARD',
        required_capability_tags: ['HANDYMAN'],
        time_weight_minutes: 45,
        allowed_addon: true,
        uncertainty_prone: true,
        uncertainty_handling: 'BUFFER',
        risk_buffer_minutes: 30,
        notes: 'Studs/solid wall unknown'
    },
    {
        job_item_id: 'tv_mount_large',
        display_name: 'Mount Large TV (>55")',
        item_class: 'STANDARD',
        required_capability_tags: ['HANDYMAN'],
        time_weight_minutes: 60,
        allowed_addon: true,
        uncertainty_prone: true,
        uncertainty_handling: 'BUFFER',
        risk_buffer_minutes: 30,
    },
    {
        job_item_id: 'mirror_hang',
        display_name: 'Hang a mirror',
        item_class: 'STANDARD',
        required_capability_tags: ['HANDYMAN'],
        time_weight_minutes: 15,
        allowed_addon: true,
        uncertainty_prone: false,
        uncertainty_handling: 'IGNORE',
        risk_buffer_minutes: 0,
        notes: 'Simple mirror, standard fixings'
    },
    {
        job_item_id: 'shelf_install_single',
        display_name: 'Install single shelf',
        item_class: 'STANDARD',
        required_capability_tags: ['HANDYMAN'],
        time_weight_minutes: 30,
        allowed_addon: true,
        uncertainty_prone: true,
        uncertainty_handling: 'BUFFER',
        risk_buffer_minutes: 15,
    },
    {
        job_item_id: 'curtain_rail_standard',
        display_name: 'Install curtain rail (up to 2m)',
        item_class: 'STANDARD',
        required_capability_tags: ['HANDYMAN'],
        time_weight_minutes: 45,
        allowed_addon: true,
        uncertainty_prone: true,
        uncertainty_handling: 'BUFFER',
        risk_buffer_minutes: 15
    },
    {
        job_item_id: 'pic_hang',
        display_name: 'Hang Picture / Frame',
        item_class: 'STANDARD',
        required_capability_tags: ['HANDYMAN'],
        time_weight_minutes: 10,
        allowed_addon: true,
        uncertainty_prone: false,
        uncertainty_handling: 'IGNORE',
        risk_buffer_minutes: 0
    },

    // --- PLUMBING (STANDARD) ---
    {
        job_item_id: 'tap_leak_fix',
        display_name: 'Fix leaking tap',
        item_class: 'STANDARD',
        required_capability_tags: ['PLUMBING'],
        time_weight_minutes: 45,
        allowed_addon: true,
        uncertainty_prone: true,
        uncertainty_handling: 'BUFFER',
        risk_buffer_minutes: 15
    },
    {
        job_item_id: 'concealed_leak_investigation',
        display_name: 'Investigate concealed pipe leak',
        item_class: 'STANDARD',
        required_capability_tags: ['PLUMBING'],
        time_weight_minutes: 60,
        allowed_addon: false,
        uncertainty_prone: true,
        uncertainty_handling: 'FORCE_H3',
        risk_buffer_minutes: 0,
        notes: 'Hidden or behind-wall plumbing work'
    },
    {
        job_item_id: 'toilet_repair_simple',
        display_name: 'Toilet Flush Repair (Internal)',
        item_class: 'STANDARD',
        required_capability_tags: ['PLUMBING'],
        time_weight_minutes: 45,
        allowed_addon: true,
        uncertainty_prone: true,
        uncertainty_handling: 'FORCE_H3', // Invasive potential
        risk_buffer_minutes: 0
    },

    // --- ELECTRICAL (STANDARD) ---
    {
        job_item_id: 'socket_replace',
        display_name: 'Replace Socket Faceplate',
        item_class: 'STANDARD',
        required_capability_tags: ['ELECTRICAL'],
        time_weight_minutes: 15,
        allowed_addon: true,
        uncertainty_prone: false,
        uncertainty_handling: 'IGNORE',
        risk_buffer_minutes: 0
    },
    {
        job_item_id: 'light_fitting_replace',
        display_name: 'Replace Light Fitting (Standard)',
        item_class: 'STANDARD',
        required_capability_tags: ['ELECTRICAL'],
        time_weight_minutes: 30,
        allowed_addon: true,
        uncertainty_prone: true,
        uncertainty_handling: 'BUFFER',
        risk_buffer_minutes: 15
    },

    // --- SPECIALIST (ISOLATED) ---
    {
        job_item_id: 'gas_cert_cp12',
        display_name: 'Gas Safety Cert (CP12)',
        item_class: 'SPECIALIST',
        required_capability_tags: ['SPECIALIST_GAS'],
        time_weight_minutes: 45,
        allowed_addon: false,
        uncertainty_prone: false,
        uncertainty_handling: 'IGNORE',
        risk_buffer_minutes: 0
    },

    // --- CLEANING (ISOLATED) ---
    {
        job_item_id: 'apartment_cleaning_standard',
        display_name: 'Apartment Cleaning',
        item_class: 'CLEANING',
        required_capability_tags: ['CLEANING'],
        time_weight_minutes: 120,
        allowed_addon: false,
        uncertainty_prone: false,
        uncertainty_handling: 'IGNORE',
        risk_buffer_minutes: 0
    },
    {
        job_item_id: 'eot_cleaning_1bed',
        display_name: 'End of Tenancy Cleaning (1 Bed)',
        item_class: 'CLEANING',
        required_capability_tags: ['CLEANING'],
        time_weight_minutes: 240,
        allowed_addon: false,
        uncertainty_prone: false,
        uncertainty_handling: 'IGNORE',
        risk_buffer_minutes: 0
    },
    {
        job_item_id: 'eot_cleaning_2bed',
        display_name: 'End of Tenancy Cleaning (2 Bed)',
        item_class: 'CLEANING',
        required_capability_tags: ['CLEANING'],
        time_weight_minutes: 360,
        allowed_addon: false,
        uncertainty_prone: false,
        uncertainty_handling: 'IGNORE',
        risk_buffer_minutes: 0
    }
]

async function main() {
    console.log('Seeding CatalogueItems...')
    for (const item of CATALOGUE_ITEMS) {
        const upsert = await prisma.catalogueItem.upsert({
            where: { job_item_id: item.job_item_id },
            update: item,
            create: item,
        })
        console.log(`Upserted: ${upsert.job_item_id}`)
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
