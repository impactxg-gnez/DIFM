import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('Checking database connection...')
    try {
        await prisma.$connect()
        console.log('Successfully connected to database.')

        const counts = await Promise.all([
            (prisma as any).user.count().catch((e: any) => `User: ${e.message}`),
            (prisma as any).job.count().catch((e: any) => `Job: ${e.message}`),
            (prisma as any).visit.count().catch((e: any) => `Visit: ${e.message}`),
            (prisma as any).customerReview.count().catch((e: any) => `CustomerReview: ${e.message}`),
            (prisma as any).visitPhoto.count().catch((e: any) => `VisitPhoto: ${e.message}`),
            (prisma as any).scopeSummary.count().catch((e: any) => `ScopeSummary: ${e.message}`),
        ])

        console.log('Table counts/errors:', counts)
    } catch (err) {
        console.error('Failed to connect or query:', err)
    } finally {
        await prisma.$disconnect()
    }
}

main()
