import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

/**
 * Configure the 5 cleaner provider accounts with specific capabilities
 * This ensures cleaners only receive cleaning jobs and never repair/installation jobs
 */
export async function POST() {
    try {
        const cookieStore = await cookies();
        const role = cookieStore.get('userRole')?.value;
        
        if (role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // Define cleaner configurations
        const cleanerConfigs = [
            {
                email: 'cleaning_1@demo.com',
                name: 'CLEANING Pro 1',
                // Mandatory capabilities for all cleaners
                mandatoryCapabilities: [
                    'C-GENERAL',
                    'C-BATHROOM',
                    'C-KITCHEN'
                ],
                // Optional area capabilities (all cleaners get these)
                optionalCapabilities: [
                    'C-BEDROOM',
                    'C-LIVING-ROOM',
                    'C-BALCONY',
                    'C-UTILITY'
                ],
                // Deep cleaning capabilities (only cleaner_1 and cleaner_2)
                deepCleaningCapabilities: [
                    'C-DEEP-BATHROOM',
                    'C-DEEP-KITCHEN',
                    'C-TILE-GROUT',
                    'C-GREASE'
                ],
                // Move-in/out (only cleaner_1 and cleaner_2)
                moveCapabilities: [
                    'C-MOVE-IN',
                    'C-MOVE-OUT'
                ]
            },
            {
                email: 'cleaning_2@demo.com',
                name: 'CLEANING Pro 2',
                mandatoryCapabilities: ['C-GENERAL', 'C-BATHROOM', 'C-KITCHEN'],
                optionalCapabilities: ['C-BEDROOM', 'C-LIVING-ROOM', 'C-BALCONY', 'C-UTILITY'],
                deepCleaningCapabilities: ['C-DEEP-BATHROOM', 'C-DEEP-KITCHEN', 'C-TILE-GROUT', 'C-GREASE'],
                moveCapabilities: ['C-MOVE-IN', 'C-MOVE-OUT']
            },
            {
                email: 'cleaning_3@demo.com',
                name: 'CLEANING Pro 3',
                mandatoryCapabilities: ['C-GENERAL', 'C-BATHROOM', 'C-KITCHEN'],
                optionalCapabilities: ['C-BEDROOM', 'C-LIVING-ROOM', 'C-BALCONY', 'C-UTILITY'],
                deepCleaningCapabilities: [],
                moveCapabilities: []
            },
            {
                email: 'cleaning_4@demo.com',
                name: 'CLEANING Pro 4',
                mandatoryCapabilities: ['C-GENERAL', 'C-BATHROOM', 'C-KITCHEN'],
                optionalCapabilities: ['C-BEDROOM', 'C-LIVING-ROOM', 'C-BALCONY', 'C-UTILITY'],
                deepCleaningCapabilities: [],
                moveCapabilities: []
            },
            {
                email: 'cleaning_5@demo.com',
                name: 'CLEANING Pro 5',
                mandatoryCapabilities: ['C-GENERAL', 'C-BATHROOM', 'C-KITCHEN'],
                optionalCapabilities: ['C-BEDROOM', 'C-LIVING-ROOM', 'C-BALCONY', 'C-UTILITY'],
                deepCleaningCapabilities: [],
                moveCapabilities: []
            }
        ];

        const results = [];

        for (const config of cleanerConfigs) {
            // Combine all capabilities
            const allCapabilities = [
                ...config.mandatoryCapabilities,
                ...config.optionalCapabilities,
                ...config.deepCleaningCapabilities,
                ...config.moveCapabilities
            ];

            const capabilitiesString = allCapabilities.join(',');

            // Update or create cleaner provider
            const cleaner = await prisma.user.upsert({
                where: { email: config.email },
                update: {
                    providerType: 'SPECIALIST',
                    providerStatus: 'ACTIVE',
                    categories: 'CLEANING', // Only CLEANING category
                    capabilities: capabilitiesString,
                    complianceConfirmed: true,
                    isOnline: true
                },
                create: {
                    email: config.email,
                    name: config.name,
                    passwordHash: 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', // password123
                    role: 'PROVIDER',
                    providerType: 'SPECIALIST',
                    providerStatus: 'ACTIVE',
                    categories: 'CLEANING',
                    capabilities: capabilitiesString,
                    complianceConfirmed: true,
                    isOnline: true,
                    latitude: 51.5074,
                    longitude: -0.1278
                }
            });

            results.push({
                email: config.email,
                name: config.name,
                capabilities: allCapabilities,
                providerType: cleaner.providerType,
                categories: cleaner.categories
            });
        }

        return NextResponse.json({
            success: true,
            message: 'Cleaner providers configured successfully',
            cleaners: results
        });

    } catch (error: any) {
        console.error('Configure cleaners error', error);
        return NextResponse.json(
            { error: error.message || 'Failed to configure cleaners' },
            { status: 500 }
        );
    }
}

export async function GET() {
    try {
        const cookieStore = await cookies();
        const role = cookieStore.get('userRole')?.value;
        
        if (role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // Get current cleaner configurations
        const cleaners = await prisma.user.findMany({
            where: {
                role: 'PROVIDER',
                email: {
                    in: [
                        'cleaning_1@demo.com',
                        'cleaning_2@demo.com',
                        'cleaning_3@demo.com',
                        'cleaning_4@demo.com',
                        'cleaning_5@demo.com'
                    ]
                }
            },
            select: {
                email: true,
                name: true,
                providerType: true,
                providerStatus: true,
                categories: true,
                capabilities: true
            }
        });

        return NextResponse.json({ cleaners });
    } catch (error: any) {
        console.error('Get cleaners error', error);
        return NextResponse.json(
            { error: error.message || 'Failed to get cleaners' },
            { status: 500 }
        );
    }
}

