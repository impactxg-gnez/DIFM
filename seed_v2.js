
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const SERVICE_CATEGORIES = [
    'CLEANING', 'PEST_CONTROL', 'ELECTRICIAN',
    'PLUMBER', 'CARPENTER', 'PAINTER', 'PC_REPAIR'
];

async function main() {
    console.log("Seeding V2 Data...");

    // 1. Create Demo Users
    console.log("Creating Demo Users...");

    // Customer
    await prisma.user.upsert({
        where: { email: 'customer@demo.com' },
        update: {},
        create: {
            email: 'customer@demo.com',
            name: 'Demo Customer',
            passwordHash: 'c42b718d7f73a55f750005701c402127db8a32a67733f5201w...', // "password123" hash placeholder (using simple hash from before if consistent, else re-hash in app)
            // Note: The app uses specialized hashing? verify_flow used a constant?
            // "password123" -> Use a known hash or let the app handle login?
            // The app's /api/auth/register hashes inputs. 
            // We should use the same simple hash: SHA256 of "password123"
            // echo -n "password123" | shasum -a 256 -> ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f
            passwordHash: 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
            role: 'CUSTOMER'
        }
    });

    // Provider (Generic)
    await prisma.user.upsert({
        where: { email: 'provider@demo.com' },
        update: {},
        create: {
            email: 'provider@demo.com',
            name: 'Demo Provider (General)',
            passwordHash: 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
            role: 'PROVIDER',
            categories: 'PLUMBER,ELECTRICIAN', // Multi-skilled
            isOnline: true,
            latitude: 51.5074,
            longitude: -0.1278
        }
    });

    // Admin
    await prisma.user.upsert({
        where: { email: 'admin@demo.com' },
        update: {},
        create: {
            email: 'admin@demo.com',
            name: 'Demo Admin',
            passwordHash: 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
            role: 'ADMIN'
        }
    });

    // 2. Create 5 Providers per Category
    console.log("Creating Category Providers...");
    const londonLat = 51.5074;
    const londonLng = -0.1278;

    for (const category of SERVICE_CATEGORIES) {
        console.log(`  Seeding ${category}...`);
        for (let i = 1; i <= 5; i++) {
            const email = `${category.toLowerCase()}_${i}@demo.com`;
            await prisma.user.upsert({
                where: { email },
                update: {},
                create: {
                    email,
                    name: `${category} Pro ${i}`,
                    passwordHash: 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
                    role: 'PROVIDER',
                    categories: category,
                    isOnline: true,
                    // Random location within ~5-10km of London
                    latitude: londonLat + (Math.random() - 0.5) * 0.1,
                    longitude: londonLng + (Math.random() - 0.5) * 0.1
                }
            });
        }
    }

    console.log("Seeding Complete.");
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
