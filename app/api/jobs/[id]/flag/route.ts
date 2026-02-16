import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applyStatusChange } from '@/lib/jobStateMachine';
import { uploadPhoto, recordPhotoMetadata, BUCKETS } from '@/lib/storage';

export async function POST(
    request: Request,
    props: { params: Promise<{ id: string }> }
) {
    try {
        const { id: jobId } = await props.params;
        const { reason, note, providerId, photos } = await request.json();

        if (!reason || !providerId) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const uploadedFlagPaths: string[] = [];

        // 🟢 Handle Flag Photos (Outside Transaction)
        if (photos) {
            const photosArray = Array.isArray(photos) ? photos : photos.split(',').filter(Boolean);
            for (let i = 0; i < photosArray.length; i++) {
                const photoData = photosArray[i];
                if (!photoData || photoData.length < 100) continue;

                const path = `flag/${jobId}/${Date.now()}_${i}.jpg`;
                let body: Buffer;
                if (photoData.startsWith('data:image')) {
                    body = Buffer.from(photoData.split(',')[1], 'base64');
                } else {
                    body = Buffer.from(photoData, 'base64');
                }

                await uploadPhoto(BUCKETS.MISMATCH_EVIDENCE, path, body);
                uploadedFlagPaths.push(path);
            }
        }

        const updatedJob = await prisma.$transaction(async (tx) => {
            // 1. Update Job with flagging details
            const job = await tx.job.update({
                where: { id: jobId },
                data: {
                    flagReason: reason,
                    flagNote: note,
                    flaggedById: providerId,
                    flaggedAt: new Date(),
                    disputePhotos: uploadedFlagPaths.join(','), // Reusing disputePhotos or flagPhotos if it existed (schema has disputePhotos)
                },
            });

            // 🟢 Record Metadata for Uploaded Photos (Inside Transaction)
            for (const path of uploadedFlagPaths) {
                await (tx as any).visitPhoto.create({
                    data: {
                        jobId,
                        bucket: BUCKETS.MISMATCH_EVIDENCE,
                        path,
                        uploadedBy: providerId,
                        photoType: 'MISMATCH',
                        deleteAfter: null // No expiry normally for mismatch/flag evidence
                    }
                });
            }

            // 2. Apply status change using state machine logic via the existing helper if possible,
            // but applyStatusChange is already a transaction. We'll do it manually here to stay in one transaction or use the helper.
            // Actually, applyStatusChange handles transitions and audit logs. Let's use it.
            return job;
        });

        // 3. Change status to FLAGGED_REVIEW
        await applyStatusChange(jobId, 'FLAGGED_REVIEW', {
            reason: `Provider flagged: ${reason}`,
            changedById: providerId,
            changedByRole: 'PROVIDER'
        });

        // 4. Deterministic actions
        // Reason	Action
        // scope_too_large	Recalculate tier deterministically (Sets to REVIEW)
        // wrong_capability	Split visit or reroute (Sets to REVIEW)
        // photo_mismatch	Trigger clarification (Sets to REVIEW)
        // safety_issue	Force rebook (Sets to REVIEW)

        let systemAction = 'FLAGGED_FOR_ADMIN_REVIEW';
        switch (reason) {
            case 'scope_too_large':
                systemAction = 'RECALCULATE_TIER_REQUIRED';
                break;
            case 'wrong_capability':
                systemAction = 'REROUTE_OR_SPLIT_REQUIRED';
                break;
            case 'photo_mismatch':
                systemAction = 'CLARIFICATION_REQUIRED';
                break;
            case 'safety_issue':
                systemAction = 'FORCE_REBOOK_REQUIRED';
                break;
        }

        console.log(`[Flagging] Job ${jobId} flagged by ${providerId} for ${reason}. System Action: ${systemAction}`);

        // Update job with the intended system action for Admin visibility
        await prisma.job.update({
            where: { id: jobId },
            data: {
                flagNote: note ? `${note} (System Action: ${systemAction})` : `System Action: ${systemAction}`
            }
        });

        return NextResponse.json({ success: true, systemAction });
    } catch (error) {
        console.error('Job flagging error', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
