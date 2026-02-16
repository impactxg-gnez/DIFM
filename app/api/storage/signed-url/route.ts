import { NextResponse } from 'next/server';
import { getSignedUrl, BUCKETS } from '@/lib/storage';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');
    const bucketType = searchParams.get('bucket'); // e.g. "SCOPE", "COMPLETION", etc.

    if (!path) {
        return NextResponse.json({ error: 'Path is required' }, { status: 400 });
    }

    let bucket = BUCKETS.SCOPE_PHOTOS;
    if (bucketType === 'COMPLETION') bucket = BUCKETS.COMPLETION_EVIDENCE;
    if (bucketType === 'PART') bucket = BUCKETS.PARTS_RECEIPTS;
    if (bucketType === 'MISMATCH') bucket = BUCKETS.MISMATCH_EVIDENCE;

    try {
        const signedUrl = await getSignedUrl(bucket, path);
        return NextResponse.json({ signedUrl });
    } catch (error) {
        console.error('Error getting signed URL', error);
        return NextResponse.json({ error: 'Failed to generate signed URL' }, { status: 500 });
    }
}
