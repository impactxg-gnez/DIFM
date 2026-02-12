
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log('--- Verification: Reschedule Dispatch & Completion Fixes ---');

    const customer = await prisma.user.findFirst({ where: { role: 'CUSTOMER' } });
    const provider = await prisma.user.findFirst({ where: { role: 'PROVIDER' } });
    if (!customer || !provider) throw new Error('Customer or Provider not found');

    // 1. Test Rescheduled Job Activation
    console.log('\n1. Testing Rescheduled Job Activation...');
    const job = await prisma.job.create({
        data: {
            description: 'Rescheduled Test',
            location: 'Test Location',
            category: 'HANDYMAN',
            fixedPrice: 60,
            customerId: customer.id,
            status: 'BOOKED',
            isASAP: true,
        }
    });

    // Create a scheduled visit (scope-locked)
    await (prisma as any).visit.create({
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

    console.log(`Job ${job.id} created in BOOKED state.`);

    // Trigger activation (imitating the GET /api/jobs logic)
    // We need to import activateBookedJobs or just call the logic
    // Since we are in a separate script, we'll just check if the logic exists in the codebase and run it via a mock API call if possible, 
    // or just run the logic here to verify it works as intended.

    const { activateBookedJobs } = require('../lib/dispatch/dispatchTracker');
    await activateBookedJobs();

    const activatedJob = await prisma.job.findUnique({ where: { id: job.id } });
    console.log(`Status after activation: ${activatedJob?.status}`);

    if (activatedJob?.status === 'ASSIGNING') {
        console.log('SUCCESS: Rescheduled job activated for dispatch.');
    } else {
        console.error('FAIL: Rescheduled job did not activate.');
        process.exit(1);
    }

    // 2. Test ON_SITE to COMPLETED Transition
    console.log('\n2. Testing ON_SITE to COMPLETED Transition...');
    await prisma.job.update({
        where: { id: job.id },
        data: {
            status: 'ON_SITE',
            providerId: provider.id,
            timerStartedAt: new Date(),
            arrival_confirmed_at: new Date()
        }
    });

    // Call the status update logic (matching lib/jobStateMachine.ts)
    const { canTransition } = require('../lib/jobStateMachine');
    const valid = canTransition('ON_SITE', 'COMPLETED');
    console.log(`Transition ON_SITE -> COMPLETED valid: ${valid}`);

    if (valid) {
        console.log('SUCCESS: ON_SITE -> COMPLETED transition is allowed.');
    } else {
        console.error('FAIL: ON_SITE -> COMPLETED transition is blocked.');
        process.exit(1);
    }

    // Cleanup
    await (prisma as any).visit.deleteMany({ where: { jobId: job.id } });
    await prisma.job.delete({ where: { id: job.id } });
    console.log('\nCleanup complete.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
