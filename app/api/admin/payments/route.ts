import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { PLATFORM_FEE_PERCENT } from '@/lib/constants';

/**
 * Admin payments view - shows payment splits for completed jobs
 */
export async function GET() {
    try {
        const cookieStore = await cookies();
        const role = cookieStore.get('userRole')?.value;
        
        if (role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // Get all completed/paid jobs with their transactions
        const jobs = await prisma.job.findMany({
            where: {
                status: { in: ['COMPLETED', 'CLOSED', 'PAID'] },
                fixedPrice: { gt: 0 }
            },
            include: {
                customer: { select: { name: true, email: true } },
                provider: { select: { name: true, email: true } },
                transactions: {
                    orderBy: { createdAt: 'asc' }
                },
                priceOverrides: {
                    orderBy: { createdAt: 'desc' },
                    take: 1 // Get the most recent override
                },
                items: true
            },
            orderBy: { createdAt: 'desc' }
        });

        // Calculate payment splits for each job
        const payments = jobs.map(job => {
            const customerPrice = job.fixedPrice;
            const platformCommission = customerPrice * PLATFORM_FEE_PERCENT;
            const providerPayout = customerPrice - platformCommission;

            // Find existing transactions
            const payoutTransaction = job.transactions.find(t => t.type === 'PAYOUT');
            const feeTransaction = job.transactions.find(t => t.type === 'FEE');

            return {
                jobId: job.id,
                jobDescription: job.description,
                customerName: job.customer.name,
                customerEmail: job.customer.email,
                providerName: job.provider?.name || 'Unassigned',
                providerEmail: job.provider?.email || null,
                status: job.status,
                customerPrice,
                platformCommission,
                providerPayout,
                createdAt: job.createdAt,
                completedAt: job.statusUpdatedAt,
                // Transaction statuses
                payoutStatus: payoutTransaction?.status || 'PENDING',
                feeStatus: feeTransaction?.status || 'PENDING',
                payoutTransactionId: payoutTransaction?.id,
                feeTransactionId: feeTransaction?.id,
                // Override info
                hasPriceOverride: job.priceOverrides.length > 0,
                originalPrice: job.priceOverrides.length > 0 ? job.priceOverrides[0].oldPrice : null,
                overrideReason: job.priceOverrides.length > 0 ? job.priceOverrides[0].reason : null
            };
        });

        // Calculate totals
        const totals = payments.reduce((acc, payment) => {
            acc.totalCustomerPrice += payment.customerPrice;
            acc.totalPlatformCommission += payment.platformCommission;
            acc.totalProviderPayout += payment.providerPayout;
            acc.totalJobs += 1;
            return acc;
        }, {
            totalCustomerPrice: 0,
            totalPlatformCommission: 0,
            totalProviderPayout: 0,
            totalJobs: 0
        });

        return NextResponse.json({
            payments,
            totals
        });
    } catch (error) {
        console.error('Get payments error', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

