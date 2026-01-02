
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const jobs = await prisma.job.findMany({
        where: {
            status: { in: ['COMPLETED', 'CLOSED', 'PAID'] }
        },
        select: {
            id: true,
            status: true,
            fixedPrice: true,
            description: true
        }
    });

    console.log('Found completed jobs:', JSON.stringify(jobs, null, 2));
}

main()
    .catch((e) => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
