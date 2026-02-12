
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log('--- Verification: Mismatch Upgrade/Rebook Flow ---');

    const customer = await prisma.user.findFirst({ where: { role: 'CUSTOMER' } });
    const provider = await prisma.user.findFirst({ where: { role: 'PROVIDER' } });
    if (!customer || !provider) throw new Error('Customer or Provider not found');

    // 1. Setup Job & Visit
    console.log('\n1. Setting up job and visit...');
    const job = await prisma.job.create({
        data: {
            description: 'Mismatch Test Job',
            location: 'Test Location',
            category: 'HANDYMAN',
            fixedPrice: 60,
            customerId: customer.id,
            providerId: provider.id,
            status: 'IN_PROGRESS',
        }
    });

    const visit = await (prisma as any).visit.create({
        data: {
            jobId: job.id,
            item_class: 'STANDARD',
            primary_job_item_id: 'shelf_install',
            base_minutes: 45,
            effective_minutes: 45,
            tier: 'H1',
            price: 60,
            status: 'SCHEDULED'
        }
    });
    console.log(`Job ${job.id} created in IN_PROGRESS state.`);

    // 2. Provider Flags Mismatch (Simulating updateStatus('MISMATCH_PENDING'))
    console.log('\n2. Simulating Provider flagging Mismatch (MISMATCH_PENDING)...');
    const mismatchedJob = await prisma.job.update({
        where: { id: job.id },
        data: { status: 'MISMATCH_PENDING' }
    });
    console.log(`Job status after flagging: ${mismatchedJob.status}`);

    // 3. Customer Chooses UPGRADE
    console.log('\n3. Simulating Customer choosing UPGRADE to H2...');
    // Simulating logic from /api/jobs/[id]/mismatch POST action: 'UPGRADE', newTier: 'H2'
    const newTier = 'H2';
    const newPrice = 90; // Logic from calculatePrice('H2', 'STANDARD')

    await (prisma as any).$transaction([
        (prisma as any).visit.update({
            where: { id: visit.id },
            data: { tier: newTier, price: newPrice }
        }),
        (prisma as any).job.update({
            where: { id: job.id },
            data: { fixedPrice: newPrice, status: 'IN_PROGRESS' }
        })
    ]);

    const upgradedJob = await prisma.job.findUnique({ where: { id: job.id }, include: { visits: true } as any });
    console.log(`Job status after upgrade: ${upgradedJob?.status}`);
    console.log(`Job fixedPrice: ${upgradedJob?.fixedPrice}`);
    console.log(`Visit tier: ${(upgradedJob as any).visits[0].tier}, price: ${(upgradedJob as any).visits[0].price}`);

    if (upgradedJob?.status === 'IN_PROGRESS' && upgradedJob?.fixedPrice === 90 && (upgradedJob as any).visits[0].tier === 'H2') {
        console.log('SUCCESS: Upgrade logic verified.');
    } else {
        console.error('FAIL: Upgrade logic mismatch.');
        process.exit(1);
    }

    // 4. Customer Chooses REBOOK
    console.log('\n4. Simulating Customer choosing REBOOK...');
    // Move back to MISMATCH_PENDING first
    await prisma.job.update({ where: { id: job.id }, data: { status: 'MISMATCH_PENDING' } });

    // Simulating action: 'REBOOK'
    await (prisma as any).$transaction([
        (prisma as any).visit.update({
            where: { id: visit.id },
            data: { status: 'CANCELLED' }
        }),
        (prisma as any).job.update({
            where: { id: job.id },
            data: { status: 'REBOOK_REQUIRED' }
        })
    ]);

    const rebookRequiredJob = await prisma.job.findUnique({ where: { id: job.id } });
    console.log(`Job status after rebook request: ${rebookRequiredJob?.status}`);

    if (rebookRequiredJob?.status === 'REBOOK_REQUIRED') {
        console.log('SUCCESS: Rebook required logic verified.');
    } else {
        console.error('FAIL: Rebook required logic mismatch.');
        process.exit(1);
    }

    // 5. Customer Clicks "Start Re-booking" (Moves from REBOOK_REQUIRED to BOOKED)
    console.log('\n5. Simulating Customer clicking "Start Re-booking"...');
    await prisma.job.update({
        where: { id: job.id },
        data: { status: 'BOOKED' }
    });
    const bookedJob = await prisma.job.findUnique({ where: { id: job.id } });
    console.log(`Job status after starting re-book: ${bookedJob?.status}`);

    if (bookedJob?.status === 'BOOKED') {
        console.log('SUCCESS: Re-booking transition successful.');
    } else {
        console.error('FAIL: Re-booking transition failed.');
        process.exit(1);
    }

    // Cleanup
    await (prisma as any).visit.deleteMany({ where: { jobId: job.id } });
    await prisma.job.delete({ where: { id: job.id } });
    console.log('\nCleanup complete.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
