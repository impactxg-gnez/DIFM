
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log('--- Diagnostic: Job and Visit Pricing ---');

    const jobs = await prisma.job.findMany({
        include: { visits: true }
    });

    jobs.forEach(job => {
        const visitSum = (job.visits as any[]).reduce((sum, v) => sum + (v.price || 0), 0);
        console.log(`Job ${job.id}:`);
        console.log(`  Description: ${job.description}`);
        console.log(`  Status: ${job.status}`);
        console.log(`  fixedPrice: ${job.fixedPrice}`);
        console.log(`  Visit Sum: ${visitSum}`);
        console.log(`  Difference: ${job.fixedPrice - visitSum}`);
        console.log('  Visits:');
        (job.visits as any[]).forEach(v => {
            console.log(`    Visit ${v.id}: £${v.price} (${v.status})`);
        });
        console.log('-------------------');
    });

    console.log('\n--- Active Jobs Filtered (as in UI) ---');
    const activeJobs = jobs.filter(j =>
        !['PAID_OUT', 'CLOSED', 'CANCELLED_FREE', 'CANCELLED_CHARGED'].includes(j.status)
    );

    console.log(`Active count: ${activeJobs.length}`);
    const totalInUI = activeJobs.reduce((sum, j) => sum + j.fixedPrice, 0);
    console.log(`Total Price showed in UI: £${totalInUI}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
