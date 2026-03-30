import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { normalizeTier } from '@/lib/pricing/tierNormalization';

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const userRole = cookieStore.get('userRole')?.value;
    const userId = cookieStore.get('userId')?.value;

    if (!userId || (userRole !== 'ADMIN' && userRole !== 'PROVIDER')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'PENDING';
    const slaStatus = searchParams.get('slaStatus');
    const capability = searchParams.get('capability');

    // Query-time SLA evaluation for pending items
    await (prisma as any).reviewQueue.updateMany({
      where: {
        status: 'PENDING',
        slaStatus: 'PENDING',
        slaDeadline: { lt: new Date() }
      },
      data: { slaStatus: 'BREACHED' }
    });

    const whereClause: any = {
      ...(status ? { status } : {}),
      ...(slaStatus ? { slaStatus } : {}),
      ...(capability ? { capability: String(capability).toUpperCase() } : {}),
    };

    const rows = await (prisma as any).reviewQueue.findMany({
      where: whereClause,
      include: {
        job: {
          select: {
            id: true,
            status: true,
            category: true,
            location: true,
            description: true
          }
        },
        visit: {
          select: {
            id: true,
            primary_job_item_id: true,
            base_minutes: true,
            effective_minutes: true,
            price: true,
            tier: true,
            status: true
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    const priorityRank: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    rows.sort((a: any, b: any) => {
      const byPriority = (priorityRank[b.reviewPriority] || 0) - (priorityRank[a.reviewPriority] || 0);
      if (byPriority !== 0) return byPriority;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    return NextResponse.json({
      items: rows.map((row: any) => ({
        ...row,
        visit: row.visit
          ? {
            ...row.visit,
            tier: normalizeTier(row.visit.tier),
          }
          : row.visit,
      }))
    });
  } catch (error) {
    console.error('[ReviewQueue] list error', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
