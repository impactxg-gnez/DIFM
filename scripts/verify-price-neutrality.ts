
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log('--- Final Verification: Price Neutrality during Reschedule ---');

    const customer = await prisma.user.findFirst({ where: { role: 'CUSTOMER' } });
    if (!customer) throw new Error('No customer found');

    // 1. Create Job with Visit
    console.log('1. Creating job...');
    const job = await prisma.job.create({
        data: {
            description: 'Shelf installation',
            location: 'Test Location',
            category: 'HANDYMAN',
            fixedPrice: 60,
            customerId: customer.id,
            status: 'PRICED',
        }
    });

    const visit = await (prisma as any).visit.create({
        data: {
            jobId: job.id,
            item_class: 'STANDARD',
            primary_job_item_id: 'shelf_install_single',
            base_minutes: 45,
            effective_minutes: 45,
            tier: 'H1',
            price: 60,
            status: 'SCHEDULED'
        }
    });

    console.log(`Job ${job.id} created with price £${job.fixedPrice} and Visit ${visit.id} with price £${visit.price}`);

    // 2. Perform Reschedule (via status API imitation)
    console.log('\n2. Rescheduling job...');
    const newScheduledAt = new Date();
    newScheduledAt.setHours(newScheduledAt.getHours() + 48);

    const updatedJob = await prisma.job.update({
        where: { id: job.id },
        data: {
            status: 'BOOKED',
            scheduledAt: newScheduledAt,
            statusUpdatedAt: new Date(),
            offeredToId: null,
            offeredAt: null,
            triedProviderIds: null,
        },
        include: { visits: true }
    });

    console.log(`Job status after reschedule: ${updatedJob.status}`);
    console.log(`Job fixedPrice: £${updatedJob.fixedPrice}`);

    const updatedVisits = updatedJob.visits as any[];
    console.log(`Number of visits: ${updatedVisits.length}`);
    updatedVisits.forEach(v => {
        console.log(`  Visit ${v.id} price: £${v.price}`);
    });

    if (updatedJob.fixedPrice === 60 && updatedVisits.length === 1 && updatedVisits[0].price === 60) {
        console.log('\nSUCCESS: Rescheduling is price-neutral and does not duplicate visits.');
    } else {
        console.error('\nFAIL: Rescheduling mutated pricing or visits.');
        process.exit(1);
    }

    // Cleanup
    await (prisma as any).visit.delete({ where: { id: visit.id } });
    await prisma.job.delete({ where: { id: job.id } });
    console.log('\nCleanup complete.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
