
const { PrismaClient } = require('@prisma/client');
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

    console.log('Found completed jobs:', jobs);
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
