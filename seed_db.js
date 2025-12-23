require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Starting seed...');

    const passwordHash = crypto.createHash('sha256').update('password123').digest('hex');

    // 1. Create Demo Users
    console.log('Creating demo users...');

    await prisma.user.upsert({
        where: { email: 'customer@demo.com' },
        update: { passwordHash, role: 'CUSTOMER' },
        create: {
            email: 'customer@demo.com',
            name: 'Demo Customer',
            passwordHash,
            role: 'CUSTOMER',
        },
    });

    await prisma.user.upsert({
        where: { email: 'provider@demo.com' },
        update: { passwordHash, role: 'PROVIDER', categories: 'PLUMBER,ELECTRICIAN', isOnline: true },
        create: {
            email: 'provider@demo.com',
            name: 'Demo Provider',
            passwordHash,
            role: 'PROVIDER',
            categories: 'PLUMBER,ELECTRICIAN',
            isOnline: true,
            latitude: 51.5074,
            longitude: -0.1278,
        },
    });

    await prisma.user.upsert({
        where: { email: 'simulator@demo.com' },
        update: { passwordHash, role: 'PROVIDER', categories: 'PLUMBER,CLEANING', isOnline: true },
        create: {
            email: 'simulator@demo.com',
            name: 'Simulation Provider',
            passwordHash,
            role: 'PROVIDER',
            categories: 'PLUMBER,CLEANING',
            isOnline: true,
            latitude: 51.5874,
            longitude: -0.0478,
        },
    });

    await prisma.user.upsert({
        where: { email: 'admin@demo.com' },
        update: { passwordHash, role: 'ADMIN' },
        create: {
            email: 'admin@demo.com',
            name: 'System Admin',
            passwordHash,
            role: 'ADMIN',
        },
    });

    // 2. Create Providers for each category
    console.log('Creating categorical providers...');
    const categories = ['CLEANING', 'PEST_CONTROL', 'ELECTRICIAN', 'PLUMBER', 'CARPENTER', 'PAINTER', 'PC_REPAIR'];
    for (const cat of categories) {
        for (let i = 1; i <= 3; i++) {
            const email = `${cat.toLowerCase()}${i}@demo.com`;
            await prisma.user.upsert({
                where: { email },
                update: { passwordHash, role: 'PROVIDER', categories: cat, isOnline: true },
                create: {
                    email,
                    name: `${cat} Pro ${i}`,
                    passwordHash,
                    role: 'PROVIDER',
                    categories: cat,
                    isOnline: true,
                    latitude: 51.5074 + (Math.random() - 0.5) * 0.1,
                    longitude: -0.1278 + (Math.random() - 0.5) * 0.1,
                }
            });
        }
    }

    console.log('✅ Seed completed successfully!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
