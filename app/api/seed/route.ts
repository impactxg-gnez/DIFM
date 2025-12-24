import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const SERVICE_CATEGORIES = [
    'CLEANING', 'PEST_CONTROL', 'ELECTRICIAN',
    'PLUMBER', 'CARPENTER', 'PAINTER', 'PC_REPAIR'
];

export async function GET() {
    try {
        // 1. Create Demo Users
        const passwordHash = 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f'; // SHA256 of "password123"

        // Customer
        await prisma.user.upsert({
            where: { email: 'customer@demo.com' },
            update: {},
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
            update: {},
            create: {
                email: 'provider@demo.com',
                name: 'Demo Provider (General)',
                passwordHash,
                role: 'PROVIDER',
                categories: 'PLUMBER,ELECTRICIAN', 
                isOnline: true,
                latitude: 51.5074,
                longitude: -0.1278
            }
        });

        // Admin
        await prisma.user.upsert({
            where: { email: 'admin@demo.com' },
            update: {},
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
            for (let i = 1; i <= 5; i++) {
                const email = `${category.toLowerCase()}_${i}@demo.com`;
                await prisma.user.upsert({
                    where: { email },
                    update: {},
                    create: {
                        email,
                        name: `${category} Pro ${i}`,
                        passwordHash,
                        role: 'PROVIDER',
                        categories: category,
                        isOnline: true,
                        latitude: londonLat + (Math.random() - 0.5) * 0.1,
                        longitude: londonLng + (Math.random() - 0.5) * 0.1
                    }
                });
            }
        }

        return NextResponse.json({ 
            message: 'Seeding Complete', 
            users: [
                'customer@demo.com', 
                'provider@demo.com', 
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
