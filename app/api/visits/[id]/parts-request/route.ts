import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applyStatusChange } from '@/lib/jobStateMachine';
import { cookies } from 'next/headers';
import { uploadPhoto, BUCKETS } from '@/lib/storage';

export async function POST(
    request: Request,
    props: { params: Promise<{ id: string }> }
) {
    const { id: visitId } = await props.params;

    try {
        const body = await request.json();
        const { partsBreakdown, partsNotes, partsPhotos } = body;

        const cookieStore = await cookies();
        const userId = cookieStore.get('userId')?.value;
        const userRole = cookieStore.get('userRole')?.value;

        if (!userId || userRole !== 'PROVIDER') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!partsBreakdown || !partsBreakdown.items || partsBreakdown.items.length === 0) {
            return NextResponse.json({ error: 'Parts breakdown is required' }, { status: 400 });
        }

        const uploadedPartsPaths: string[] = [];

        // 🟢 Handle Parts Photos (Outside Transaction)
        if (partsPhotos) {
            const photosArray = Array.isArray(partsPhotos) ? partsPhotos : partsPhotos.split(',').filter(Boolean);
            for (let i = 0; i < photosArray.length; i++) {
                const photoData = photosArray[i];
                if (!photoData || photoData.length < 100) continue;

                const path = `parts/${visitId}/${Date.now()}_${i}.jpg`;
                let body: Buffer;
                if (photoData.startsWith('data:image')) {
                    body = Buffer.from(photoData.split(',')[1], 'base64');
                } else {
                    body = Buffer.from(photoData, 'base64');
                }

                await uploadPhoto(BUCKETS.PARTS_RECEIPTS, path, body);
                uploadedPartsPaths.push(path);
            }
        }

        const result = await prisma.$transaction(async (tx) => {
            const visit = await tx.visit.findUnique({
                where: { id: visitId },
                include: { job: true }
            });

            if (!visit) throw new Error('Visit not found');

            // Verify provider is assigned to this job
            if (visit.job.providerId !== userId) {
                throw new Error('Not authorized for this visit');
            }

            // Verify visit/job is in progress
            if (visit.job.status !== 'IN_PROGRESS' && visit.job.status !== 'ON_SITE') {
                throw new Error('Can only request parts during active work');
            }

            const now = new Date();

            // Update visit with parts request
            const updatedVisit = await tx.visit.update({
                where: { id: visitId },
                data: {
                    partsStatus: 'PENDING',
                    partsRequestedAt: now,
                    partsBreakdown,
                    partsNotes: partsNotes || null,
                    partsPhotos: uploadedPartsPaths.join(','),
                }
            });

            // 🟢 Record Metadata for Uploaded Photos (Inside Transaction)
            for (const path of uploadedPartsPaths) {
                await (tx as any).visitPhoto.create({
                    data: {
                        visitId,
                        jobId: visit.jobId,
                        bucket: BUCKETS.PARTS_RECEIPTS,
                        path,
                        uploadedBy: userId,
                        photoType: 'PART',
                        deleteAfter: null
                    }
                });
            }

            // Transition job state to PARTS_PENDING_APPROVAL (this also pauses timer via status update)
            await applyStatusChange(visit.jobId, 'PARTS_PENDING_APPROVAL', {
                tx,
                reason: 'Provider requested parts',
                changedById: userId,
                changedByRole: 'PROVIDER'
            } as any);

            // Ensure timer fields are set for backward compatibility or UI display
            await tx.job.update({
                where: { id: visit.jobId },
                data: {
                    timerPausedAt: now,
                    timerPausedForParts: true,
                    timerPausedForPartsAt: now,
                }
            });

            return updatedVisit;
        });

        return NextResponse.json({ success: true, visit: result });

    } catch (error: any) {
        console.error('Parts request error', error);
        const message = error?.message || 'Internal Server Error';
        const statusCode = message.includes('authorized') || message.includes('only request') ? 400 : 500;
        return NextResponse.json({ error: message }, { status: statusCode });
    }
}
