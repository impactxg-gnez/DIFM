import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { supabaseAdmin } from '@/lib/supabase';
import { ensureBuckets } from '@/lib/storage';

/**
 * Daily Cleanup Job
 * - Deletes expired photos from Supabase Storage
 * - Marks metadata rows as isDeleted = true
 */
export async function GET(request: Request) {
    try {
        // Optional: Security check for cron secret
        // const authHeader = request.headers.get('authorization');
        // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        //     return new Response('Unauthorized', { status: 401 });
        // }

        // Start by ensuring buckets exist (lazy initialization)
        await ensureBuckets();

        const now = new Date();
        const expiredPhotos = await (prisma as any).visitPhoto.findMany({
            where: {
                deleteAfter: { lte: now },
                isDeleted: false,
            },
        });

        console.log(`[Cleanup] Found ${expiredPhotos.length} expired photos.`);

        const results = [];
        for (const photo of expiredPhotos) {
            console.log(`[Cleanup] Deleting ${photo.path} from bucket ${photo.bucket}`);

            const { error: deleteError } = await supabaseAdmin.storage
                .from(photo.bucket)
                .remove([photo.path]);

            if (deleteError) {
                console.error(`[Cleanup] Error deleting ${photo.path}:`, deleteError);
                continue;
            }

            await (prisma as any).visitPhoto.update({
                where: { id: photo.id },
                data: { isDeleted: true },
            });

            results.push(photo.id);
        }

        return NextResponse.json({
            success: true,
            deletedCount: results.length,
            processedAt: now.toISOString(),
        });

    } catch (error: any) {
        console.error('Cleanup error', error);
        return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
    }
}
