
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Checking Cleaner Accounts ---');
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
            role: true,
            providerType: true,
            categories: true,
            providerStatus: true,
            latitude: true,
            longitude: true
        }
    });
    console.log(JSON.stringify(cleaners, null, 2));

    console.log('\n--- Checking Recent Jobs ---');
    const jobs = await prisma.job.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            description: true,
            category: true,
            status: true,
            providerId: true,
            latitude: true,
            longitude: true,
            requiredCapability: true
        }
    });
    console.log(JSON.stringify(jobs, null, 2));
}

main()
    .catch((e) => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
