import { NextResponse } from 'next/server';
import { calculateDIFMPriceService } from '@/lib/difm/service';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = calculateDIFMPriceService({
      number_of_plugs: body?.number_of_plugs,
      tier: body?.tier,
    });

    const status = result.success ? 200 : 400;
    return NextResponse.json(result, { status });
  } catch (error) {
    console.error('[DIFM_API_ERROR]', error);
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: 'Invalid JSON body',
        version: 'v1',
        calculation_id: '00000000-0000-5000-8000-000000000000',
      },
      { status: 400 }
    );
  }
}

