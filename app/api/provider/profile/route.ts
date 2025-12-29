import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

/**
 * Milestone 2: Provider profile management
 * GET: Get provider profile
 * POST: Update provider profile
 */
export async function GET() {
    try {
        const cookieStore = await cookies();
        const userId = cookieStore.get('userId')?.value;
        const userRole = cookieStore.get('userRole')?.value;

        if (!userId || userRole !== 'PROVIDER') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const provider = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                documents: true
            }
        });

        if (!provider) {
            return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
        }

        const { passwordHash, ...providerWithoutPassword } = provider;
        return NextResponse.json(providerWithoutPassword);
    } catch (error) {
        console.error('Get provider profile error', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const cookieStore = await cookies();
        const userId = cookieStore.get('userId')?.value;
        const userRole = cookieStore.get('userRole')?.value;

        if (!userId || userRole !== 'PROVIDER') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const body = await request.json();
        const { 
            providerType, 
            categories, 
            capabilities, 
            serviceArea, 
            complianceConfirmed,
            latitude,
            longitude
        } = body;

        // Validate provider type
        if (providerType && !['HANDYMAN', 'SPECIALIST'].includes(providerType)) {
            return NextResponse.json({ error: 'Invalid provider type' }, { status: 400 });
        }

        const updated = await prisma.user.update({
            where: { id: userId },
            data: {
                ...(providerType && { providerType }),
                ...(categories !== undefined && { categories }),
                ...(capabilities !== undefined && { capabilities }),
                ...(serviceArea !== undefined && { serviceArea }),
                ...(complianceConfirmed !== undefined && { complianceConfirmed }),
                ...(latitude !== undefined && { latitude: latitude ? parseFloat(latitude) : null }),
                ...(longitude !== undefined && { longitude: longitude ? parseFloat(longitude) : null }),
            }
        });

        const { passwordHash, ...providerWithoutPassword } = updated;
        return NextResponse.json(providerWithoutPassword);
    } catch (error) {
        console.error('Update provider profile error', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

