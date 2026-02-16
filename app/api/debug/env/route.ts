import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    const keys = {
        NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        DATABASE_URL: !!process.env.DATABASE_URL,
        URL_VAL: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 15) + '...',
        ANON_VAL: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.substring(0, 10) + '...',
        SERVICE_VAL: process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 10) + '...',
    };

    return NextResponse.json({
        message: 'Environment Diagnostics',
        keys,
        node_env: process.env.NODE_ENV
    });
}
