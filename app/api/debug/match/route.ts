
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        // 1. Get the cleaner
        const cleaner = await prisma.user.findUnique({
            where: { email: 'cleaning_1@demo.com' }
        });

        if (!cleaner) {
            return NextResponse.json({ error: 'Cleaner not found' });
        }

        // 2. Get the latest CLEANING job
        const job = await prisma.job.findFirst({
            where: { category: 'CLEANING', status: 'DISPATCHED' },
            orderBy: { createdAt: 'desc' },
            include: { provider: true } // to check providerId
        });

        if (!job) {
            const anyCleaningJob = await prisma.job.findFirst({
                where: { category: 'CLEANING' },
                orderBy: { createdAt: 'desc' }
            });
            return NextResponse.json({ error: 'No DISPATCHED cleaning job found', latestAnyStatus: anyCleaningJob });
        }

        // 3. Simulate Logic
        const myCategories = cleaner.categories?.split(',') || [];
        const myProviderType = cleaner.providerType;

        let matchResult = "NO MATCH";
        let filters = {};

        if (myProviderType === 'HANDYMAN') {
            filters = { type: 'HANDYMAN', note: 'Cleaner should be SPECIALIST' };
        } else if (myProviderType === 'SPECIALIST') {
            const categoryFilters = [];
            if (myCategories.length > 0) {
                for (const cat of myCategories) {
                    if (cat === 'CLEANING') {
                        categoryFilters.push({ category: 'CLEANING' });
                    } else {
                        categoryFilters.push({ category: cat });
                    }
                }
            }
            filters = { type: 'SPECIALIST', categoryFilters };

            // Check if job matches any filter
            const matches = categoryFilters.some(f => f.category === job.category);
            if (matches) matchResult = "MATCH";
        }

        return NextResponse.json({
            cleaner: {
                email: cleaner.email,
                type: cleaner.providerType,
                categories: cleaner.categories,
                splitCategories: myCategories
            },
            job: {
                id: job.id,
                description: job.description,
                category: job.category,
                status: job.status,
                providerId: job.providerId
            },
            simulation: {
                matchResult,
                filters,
                logicCheck: (job.category === 'CLEANING' && myCategories.includes('CLEANING')) ? "SHOULD MATCH" : "LOGIC FAIL"
            }
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
