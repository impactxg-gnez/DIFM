import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const SERVICE_CATEGORIES = [
    'HANDYMAN', 'CLEANING', 'PEST_CONTROL', 'ELECTRICIAN',
    'PLUMBER', 'CARPENTER', 'PAINTER', 'PC_REPAIR'
];

export async function GET() {
    try {
        // 0. Cleanup existing jobs and related data (Admin requirement)
        await prisma.scopeSummary.deleteMany({});
        await prisma.visit.deleteMany({});
        await prisma.transaction.deleteMany({});
        await prisma.customerReview.deleteMany({});
        await prisma.adminReview.deleteMany({});
        await prisma.jobItem.deleteMany({});
        await prisma.jobStateChange.deleteMany({});
        await prisma.priceOverride.deleteMany({});
        await prisma.job.deleteMany({});

        // 1. Create Demo Users
        const passwordHash = 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f'; // SHA256 of "password123"

        // Customer
        await prisma.user.upsert({
            where: { email: 'customer@demo.com' },
            update: { passwordHash },
            create: {
                email: 'customer@demo.com',
                name: 'Demo Customer',
                passwordHash,
                role: 'CUSTOMER'
            }
        });

        // Provider (Generic)
        await prisma.user.upsert({
            where: { email: 'provider@demo.com' },
            update: {
                passwordHash,
                role: 'PROVIDER',
                categories: 'PLUMBER,ELECTRICIAN',
                providerType: 'SPECIALIST',
                providerStatus: 'ACTIVE',
                complianceConfirmed: true,
                isOnline: true
            },
            create: {
                email: 'provider@demo.com',
                name: 'Demo Provider (General)',
                passwordHash,
                role: 'PROVIDER',
                categories: 'PLUMBER,ELECTRICIAN',
                providerType: 'SPECIALIST',
                providerStatus: 'ACTIVE',
                complianceConfirmed: true,
                isOnline: true,
                latitude: 51.5074,
                longitude: -0.1278
            }
        });

        // Simulator Provider
        await prisma.user.upsert({
            where: { email: 'simulator@demo.com' },
            update: {
                passwordHash,
                role: 'PROVIDER',
                categories: 'PLUMBER,CLEANING',
                providerType: 'SPECIALIST',
                providerStatus: 'ACTIVE',
                complianceConfirmed: true,
                isOnline: true
            },
            create: {
                email: 'simulator@demo.com',
                name: 'Simulation Provider',
                passwordHash,
                role: 'PROVIDER',
                categories: 'PLUMBER,CLEANING',
                providerType: 'SPECIALIST',
                providerStatus: 'ACTIVE',
                complianceConfirmed: true,
                isOnline: true,
                latitude: 51.5874,
                longitude: -0.0478,
            }
        });

        // Admin
        await prisma.user.upsert({
            where: { email: 'admin@demo.com' },
            update: { passwordHash, role: 'ADMIN' },
            create: {
                email: 'admin@demo.com',
                name: 'Demo Admin',
                passwordHash,
                role: 'ADMIN'
            }
        });

        // 2. Create Category Providers
        const londonLat = 51.5074;
        const londonLng = -0.1278;

        for (const category of SERVICE_CATEGORIES) {
            // Determine provider type: HANDYMAN is handyman, all others are specialists
            const isHandyman = category === 'HANDYMAN';
            const providerType = isHandyman ? 'HANDYMAN' : 'SPECIALIST';

            // For testing, handymen get ALL categories and capabilities
            const pCategories = isHandyman
                ? SERVICE_CATEGORIES.join(',')
                : category;
            const pCapabilities = isHandyman
                ? 'HANDYMAN,PLUMBING,ELECTRICAL,SPECIALIST_GAS,CLEANING,PAINTER,CARPENTER'
                : undefined;

            for (let i = 1; i <= 5; i++) {
                const email = `${category.toLowerCase()}_${i}@demo.com`;
                await prisma.user.upsert({
                    where: { email },
                    update: {
                        providerType,
                        providerStatus: 'ACTIVE',
                        complianceConfirmed: true,
                        categories: pCategories,
                        capabilities: pCapabilities,
                        isOnline: true,
                    },
                    create: {
                        email,
                        name: `${category} Pro ${i}`,
                        passwordHash,
                        role: 'PROVIDER',
                        categories: pCategories,
                        capabilities: pCapabilities,
                        providerType,
                        providerStatus: 'ACTIVE',
                        complianceConfirmed: true,
                        isOnline: true,
                    }
                });
            }
        }

        return NextResponse.json({
            message: 'Seeding Complete (Jobs Purged, Handymen Upgraded)',
            users: [
                'customer@demo.com',
                'provider@demo.com',
                'simulator@demo.com',
                'admin@demo.com',
                'Plus 35 categorical providers'
            ],
            password: 'password123'
        });

    } catch (error) {
        console.error('Seeding Error:', error);
        return NextResponse.json({ error: 'Failed to seed database', details: String(error) }, { status: 500 });
    }
}
