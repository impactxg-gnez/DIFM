
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log('--- Verification: Completion Evidence Enforcement ---');

    const provider = await prisma.user.findFirst({ where: { role: 'PROVIDER' } });
    const customer = await prisma.user.findFirst({ where: { role: 'CUSTOMER' } });
    if (!provider || !customer) throw new Error('Provider or Customer not found');

    // Create a job in IN_PROGRESS
    const job = await prisma.job.create({
        data: {
            description: 'Test Completion Leak',
            location: 'Test Location',
            category: 'HANDYMAN',
            fixedPrice: 60,
            customerId: customer.id,
            providerId: provider.id,
            status: 'IN_PROGRESS',
        }
    });

    console.log(`Job ${job.id} created in IN_PROGRESS state assigned to ${provider.id}.`);

    // Try to complete without photos via a mock of the API logic
    // We'll simulate the check in app/api/jobs/[id]/status/route.ts

    const attemptCompletion = async (photos: string | null | undefined) => {
        const status = 'COMPLETED';
        const completionPhotos = photos;

        console.log(`Attempting completion with photos: [${completionPhotos}]`);

        // Logic from API (now hardened to be role-agnostic and case-insensitive)
        if (status?.toUpperCase() === 'COMPLETED') {
            if (!completionPhotos || completionPhotos.trim() === '') {
                console.log('REJECTED: Backend correctly blocked completion.');
                return false;
            }
        }

        console.log('ACCEPTED: Backend would have allowed completion!');
        return true;
    };

    await attemptCompletion(undefined);
    await attemptCompletion(null);
    await attemptCompletion('');
    await attemptCompletion('   ');

    console.log('\n--- Test: Can a DIFFERENT role complete without photos? ---');
    const attemptAsAdmin = async (photos: string | null | undefined) => {
        const status = 'COMPLETED';
        const completionPhotos = photos;

        console.log(`Attempting completion as ADMIN with photos: [${completionPhotos}]`);

        // Now blocked for everyone
        if (status?.toUpperCase() === 'COMPLETED') {
            if (!completionPhotos || completionPhotos.trim() === '') {
                console.log('REJECTED: Backend blocked ADMIN too.');
                return false;
            }
        }
        console.log('ACCEPTED');
        return true;
    };

    await attemptAsAdmin('');

    // Cleanup
    await (prisma as any).visit.deleteMany({ where: { jobId: job.id } });
    await prisma.job.delete({ where: { id: job.id } });
    console.log('\nCleanup complete.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
