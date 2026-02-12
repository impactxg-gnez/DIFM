
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    const result = await prisma.job.deleteMany({
        where: {
            OR: [
                { description: 'Test Reschedule Required' },
                { description: 'Test Cancel from Reschedule Required' }
            ]
        }
    });
    console.log(`Cleaned up ${result.count} ghost jobs.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
