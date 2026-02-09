import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

export async function POST(
    request: Request,
    props: { params: Promise<{ id: string }> }
) {
    try {
        const cookieStore = await cookies();
        const role = cookieStore.get('userRole')?.value;
        
        if (role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { id } = await props.params;
        const body = await request.json();
        
        // Extract allowed fields for provider update
        const {
            providerStatus,
            providerType,
            categories,
            capabilities,
            serviceArea,
            isOnline
        } = body;

        // Build update data - only include fields that were provided
        const updateData: any = {};
        if (providerStatus !== undefined) updateData.providerStatus = providerStatus;
        if (providerType !== undefined) updateData.providerType = providerType;
        if (categories !== undefined) updateData.categories = categories;
        if (capabilities !== undefined) updateData.capabilities = capabilities;
        if (serviceArea !== undefined) updateData.serviceArea = serviceArea;
        if (isOnline !== undefined) updateData.isOnline = isOnline;

        const updatedProvider = await prisma.user.update({
            where: { id },
            data: updateData,
            select: {
                id: true,
                name: true,
                email: true,
                providerStatus: true,
                providerType: true,
                categories: true,
                capabilities: true,
                serviceArea: true,
                isOnline: true
            }
        });

        return NextResponse.json(updatedProvider);
    } catch (error) {
        console.error('Update provider error', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function GET(
    request: Request,
    props: { params: Promise<{ id: string }> }
) {
    try {
        const cookieStore = await cookies();
        const role = cookieStore.get('userRole')?.value;
        
        if (role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { id } = await props.params;

        const provider = await prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                email: true,
                providerStatus: true,
                providerType: true,
                categories: true,
                capabilities: true,
                serviceArea: true,
                isOnline: true,
                latitude: true,
                longitude: true,
                createdAt: true,
                _count: {
                    select: {
                        jobsAssigned: true,
                        documents: true
                    }
                }
            }
        });

        if (!provider) {
            return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
        }

        return NextResponse.json(provider);
    } catch (error) {
        console.error('Get provider error', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

