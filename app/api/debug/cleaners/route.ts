
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        const cleaners = await prisma.user.findMany({
            where: {
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
                providerType: true,
                categories: true,
                capabilities: true,
                providerStatus: true
            }
        });

        const recentJobs = await prisma.job.findMany({
            take: 5,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                description: true,
                category: true,
                status: true,
                providerId: true,
                requiredCapability: true
            }
        });

        return NextResponse.json({ cleaners, recentJobs });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
