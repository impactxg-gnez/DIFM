import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

/**
 * Milestone 2: Admin provider management
 * GET: Get provider details
 * POST: Update provider (approve, pause, ban, edit capabilities)
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const cookieStore = await cookies();
        const role = cookieStore.get('userRole')?.value;
        if (role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const provider = await prisma.user.findUnique({
            where: { id },
            include: {
                documents: true,
                jobsAssigned: {
                    select: {
                        id: true,
                        status: true,
                        description: true,
                        createdAt: true
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 10
                }
            }
        });

        if (!provider || provider.role !== 'PROVIDER') {
            return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
        }

        const { passwordHash, ...providerWithoutPassword } = provider;
        return NextResponse.json(providerWithoutPassword);
    } catch (error) {
        console.error('Get provider error', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const cookieStore = await cookies();
        const role = cookieStore.get('userRole')?.value;
        const adminId = cookieStore.get('userId')?.value;
        
        if (role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const body = await request.json();
        const { 
            providerStatus, 
            providerType, 
            categories, 
            capabilities,
            serviceArea 
        } = body;

        const provider = await prisma.user.findUnique({ where: { id } });
        if (!provider || provider.role !== 'PROVIDER') {
            return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
        }

        // Validate status
        if (providerStatus && !['PENDING', 'ACTIVE', 'PAUSED', 'BANNED'].includes(providerStatus)) {
            return NextResponse.json({ error: 'Invalid provider status' }, { status: 400 });
        }

        // If changing to PAUSED or BANNED, check for active jobs and handle them
        if (providerStatus && ['PAUSED', 'BANNED'].includes(providerStatus) && provider.providerStatus === 'ACTIVE') {
            const activeJobs = await prisma.job.findMany({
                where: {
                    providerId: id,
                    status: { in: ['ACCEPTED', 'IN_PROGRESS'] }
                }
            });

            // Return jobs to dispatch pool
            if (activeJobs.length > 0) {
                await prisma.job.updateMany({
                    where: {
                        providerId: id,
                        status: { in: ['ACCEPTED', 'IN_PROGRESS'] }
                    },
                    data: {
                        providerId: null,
                        status: 'DISPATCHED',
                        statusUpdatedAt: new Date()
                    }
                });

                // Log state changes
                for (const job of activeJobs) {
                    await prisma.jobStateChange.create({
                        data: {
                            jobId: job.id,
                            fromStatus: job.status,
                            toStatus: 'DISPATCHED',
                            reason: `Provider ${providerStatus.toLowerCase()}, job returned to dispatch pool`,
                            changedById: adminId || undefined,
                            changedByRole: 'ADMIN'
                        }
                    });
                }
            }
        }

        const updated = await prisma.user.update({
            where: { id },
            data: {
                ...(providerStatus && { providerStatus }),
                ...(providerType && { providerType }),
                ...(categories !== undefined && { categories }),
                ...(capabilities !== undefined && { capabilities }),
                ...(serviceArea !== undefined && { serviceArea }),
            }
        });

        const { passwordHash, ...providerWithoutPassword } = updated;
        return NextResponse.json(providerWithoutPassword);
    } catch (error) {
        console.error('Update provider error', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

