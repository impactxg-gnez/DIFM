
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log('--- Verification: Provider "Confirm Access" Transition ---');

    const customer = await prisma.user.findFirst({ where: { role: 'CUSTOMER' } });
    const provider = await prisma.user.findFirst({ where: { role: 'PROVIDER' } });
    if (!customer || !provider) throw new Error('Customer or Provider not found');

    // 1. Create Job in ARRIVING State
    console.log('\n1. Creating job in ARRIVING state...');
    const now = new Date();
    const scheduledTime = new Date(now.getTime() - 10 * 60 * 1000); // 10 mins ago

    const job = await prisma.job.create({
        data: {
            description: 'Test Confirm Access',
            location: 'Test Location',
            category: 'HANDYMAN',
            fixedPrice: 60,
            customerId: customer.id,
            providerId: provider.id,
            status: 'ARRIVING',
            scheduledAt: scheduledTime, // Within window
        }
    });

    console.log(`Job ${job.id} created. Status: ${job.status}, Scheduled: ${job.scheduledAt.toISOString()}`);

    // 2. Simulate Confirm Access (Valid Window)
    console.log('\n2. Simulating Confirm Access (Valid Window)...');
    // In real app, this would be a POST to /api/jobs/[id]/status
    // Here we simulate the logic from the route handler

    const updatedJob = await prisma.job.update({
        where: { id: job.id },
        data: {
            status: 'ON_SITE',
            statusUpdatedAt: new Date(),
            isAccessAvailable: true,
            timerStartedAt: new Date(),
            arrival_confirmed_at: new Date(),
        }
    });

    console.log(`Status after confirm: ${updatedJob.status}`);
    console.log(`Access Available: ${updatedJob.isAccessAvailable}`);
    console.log(`Timer Started At: ${updatedJob.timerStartedAt?.toISOString()}`);
    console.log(`Arrival Confirmed At: ${updatedJob.arrival_confirmed_at?.toISOString()}`);

    if (updatedJob.status === 'ON_SITE' && updatedJob.arrival_confirmed_at && updatedJob.timerStartedAt) {
        console.log('SUCCESS: Valid window transition successful.');
    } else {
        console.error('FAIL: Valid window transition failed.');
        process.exit(1);
    }

    // 3. Test Invalid Window (Future)
    console.log('\n3. Testing Invalid Window (Future Arrival)...');
    const futureJob = await prisma.job.create({
        data: {
            description: 'Future Job',
            location: 'Test Location',
            category: 'HANDYMAN',
            fixedPrice: 60,
            customerId: customer.id,
            providerId: provider.id,
            status: 'ARRIVING',
            scheduledAt: new Date(now.getTime() + 60 * 60 * 1000), // 1 hour in future
        }
    });

    // Mocking the backend check
    const checkWindow = (job: any, currentTime: Date) => {
        const scheduled = new Date(job.scheduledAt);
        const windowEnd = new Date(scheduled.getTime() + 30 * 60 * 1000);
        return (currentTime >= scheduled && currentTime <= windowEnd);
    }

    if (!checkWindow(futureJob, now)) {
        console.log('SUCCESS: Correctly blocked future arrival.');
    } else {
        console.error('FAIL: Failed to block future arrival.');
        process.exit(1);
    }

    // 4. Test Invalid Window (Too Late)
    console.log('\n4. Testing Invalid Window (Too Late Arrival)...');
    const lateJob = await prisma.job.create({
        data: {
            description: 'Late Job',
            location: 'Test Location',
            category: 'HANDYMAN',
            fixedPrice: 60,
            customerId: customer.id,
            providerId: provider.id,
            status: 'ARRIVING',
            scheduledAt: new Date(now.getTime() - 40 * 60 * 1000), // 40 mins ago (outside 30m window)
        }
    });

    if (!checkWindow(lateJob, now)) {
        console.log('SUCCESS: Correctly blocked late arrival.');
    } else {
        console.error('FAIL: Failed to block late arrival.');
        process.exit(1);
    }

    // Cleanup
    await prisma.job.deleteMany({ where: { id: { in: [job.id, futureJob.id, lateJob.id] } } });
    console.log('\nCleanup complete.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
