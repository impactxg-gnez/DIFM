import { supabase, supabaseAdmin } from './supabase';
import { prisma } from './prisma';

export const BUCKETS = {
    SCOPE_PHOTOS: 'scope-photos',
    COMPLETION_EVIDENCE: 'completion-evidence',
    PARTS_RECEIPTS: 'parts-receipts',
    MISMATCH_EVIDENCE: 'mismatch-evidence',
};

/**
 * Upload a file to a private Supabase bucket
 */
export async function uploadPhoto(
    bucket: string,
    path: string,
    fileBody: Buffer | Blob | string,
    contentType: string = 'image/jpeg'
) {
    const { data, error } = await supabaseAdmin.storage
        .from(bucket)
        .upload(path, fileBody, {
            contentType,
            upsert: true,
        });

    if (error) throw error;
    return data;
}

/**
 * Generate a signed URL for private viewing
 */
export async function getSignedUrl(bucket: string, path: string, expiresIn: number = 3600) {
    const { data, error } = await supabaseAdmin.storage
        .from(bucket)
        .createSignedUrl(path, expiresIn);

    if (error) throw error;
    return data.signedUrl;
}

/**
 * Ensure all buckets exist and are private
 */
export async function ensureBuckets() {
    const bucketList = Object.values(BUCKETS);
    for (const bucket of bucketList) {
        const { data: existing } = await supabaseAdmin.storage.getBucket(bucket);
        if (!existing) {
            console.log(`[Storage] Creating bucket: ${bucket}`);
            await supabaseAdmin.storage.createBucket(bucket, {
                public: false,
                fileSizeLimit: 20971520, // 20MB
            });
        }
    }
}

/**
 * Track photo in database
 */
export async function recordPhotoMetadata(params: {
    visitId?: string;
    jobId: string;
    bucket: string;
    path: string;
    uploadedBy: string;
    photoType: string;
    deleteAfter?: Date;
}) {
    return (prisma as any).visitPhoto.create({
        data: {
            visitId: params.visitId,
            jobId: params.jobId,
            bucket: params.bucket,
            path: params.path,
            uploadedBy: params.uploadedBy,
            photoType: params.photoType,
            deleteAfter: params.deleteAfter,
        },
    });
}
