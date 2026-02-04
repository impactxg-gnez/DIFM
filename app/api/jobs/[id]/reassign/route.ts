import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

/**
 * Milestone 2: Admin job reassignment
 * POST: Reassign a job to a different provider or return to dispatch pool
 */
export async function POST(
    request: Request,
    props: { params: Promise<{ id: string }> }
) {
    const { id } = await props.params;

    try {
        const cookieStore = await cookies();
        const adminId = cookieStore.get('userId')?.value;
        const role = cookieStore.get('userRole')?.value;

        if (role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const body = await request.json();
        const { providerId, reason } = body;

        const job = await prisma.job.findUnique({
            where: { id },
            include: { provider: true }
        });

        if (!job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        const now = new Date();
        const oldProviderId = job.providerId;

        // If reassigning to a provider, verify they're ACTIVE
        if (providerId) {
            const newProvider = await prisma.user.findUnique({
                where: { id: providerId }
            });

            if (!newProvider || newProvider.role !== 'PROVIDER' || newProvider.providerStatus !== 'ACTIVE') {
                return NextResponse.json({ error: 'Invalid or inactive provider' }, { status: 400 });
            }
        }

        // Update job
        const updatedJob = await prisma.job.update({
            where: { id },
            data: {
                providerId: providerId || null,
                status: providerId ? 'ACCEPTED' : 'DISPATCHED',
                statusUpdatedAt: now,
                ...(providerId && { acceptedAt: now })
            }
        });

        // Log state change
        await prisma.jobStateChange.create({
            data: {
                jobId: id,
                fromStatus: job.status,
                toStatus: providerId ? 'ACCEPTED' : 'DISPATCHED',
                reason: reason || `Admin reassignment${providerId ? ` to provider ${providerId}` : ' - returned to dispatch pool'}`,
                changedById: adminId || undefined,
                changedByRole: 'ADMIN'
            }
        });

        return NextResponse.json(updatedJob);
    } catch (error) {
        console.error('Reassign job error', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

