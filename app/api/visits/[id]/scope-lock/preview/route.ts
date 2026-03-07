import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { computeScopePricing } from '@/lib/pricing/scopeLockEngine';

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id: visitId } = await props.params;
    const body = await request.json();
    const { answers } = body as { answers: Record<string, string> };

    if (!answers || typeof answers !== 'object') {
      return NextResponse.json({ error: 'Missing answers' }, { status: 400 });
    }

    const visit = await (prisma as any).visit.findUnique({
      where: { id: visitId }
    });
    if (!visit) {
      return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
    }

    const before = {
      minutes: visit.base_minutes ?? 0,
      tier: visit.tier,
      price: visit.price ?? 0
    };
    const after = computeScopePricing(visit, answers);

    return NextResponse.json({
      minutes_before: before.minutes,
      minutes_after: after.effectiveMinutes,
      tier_before: before.tier,
      tier_after: after.finalTier,
      price_before: before.price,
      price_after: after.finalPrice,
      extra_minutes: after.extraMinutes
    });
  } catch (error) {
    console.error('[ScopeLockPreview] error', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

