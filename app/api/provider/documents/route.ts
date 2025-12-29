import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

/**
 * Milestone 2: Provider document upload
 * POST: Upload a document (ID proof or liability insurance)
 */
export async function POST(request: Request) {
    try {
        const cookieStore = await cookies();
        const userId = cookieStore.get('userId')?.value;
        const userRole = cookieStore.get('userRole')?.value;

        if (!userId || userRole !== 'PROVIDER') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const body = await request.json();
        const { documentType, fileUrl } = body;

        if (!documentType || !fileUrl) {
            return NextResponse.json({ error: 'Missing documentType or fileUrl' }, { status: 400 });
        }

        if (!['ID_PROOF', 'LIABILITY_INSURANCE'].includes(documentType)) {
            return NextResponse.json({ error: 'Invalid document type' }, { status: 400 });
        }

        // For Milestone 2, we just store the URL (file upload handling can be added later)
        const document = await prisma.providerDocument.create({
            data: {
                userId,
                documentType,
                fileUrl,
            }
        });

        return NextResponse.json(document);
    } catch (error) {
        console.error('Upload document error', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function GET() {
    try {
        const cookieStore = await cookies();
        const userId = cookieStore.get('userId')?.value;
        const userRole = cookieStore.get('userRole')?.value;

        if (!userId || userRole !== 'PROVIDER') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const documents = await prisma.providerDocument.findMany({
            where: { userId },
            orderBy: { uploadedAt: 'desc' }
        });

        return NextResponse.json(documents);
    } catch (error) {
        console.error('Get documents error', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

