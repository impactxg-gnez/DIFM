import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createHash } from 'crypto';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { email, password } = body;

        if (!email || !password) {
            return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
        }

        const user = await prisma.user.findUnique({
            where: { email },
        });

        if (!user) {
            return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
        }

        const inputHash = createHash('sha256').update(password).digest('hex');

        if (inputHash !== user.passwordHash) {
            return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
        }

        // Simple session: Store User ID in a cookie (Not secure for prod, perfect for V1 demo)
        const cookieStore = await cookies();
        cookieStore.set('userId', user.id, {
            httpOnly: true,
            path: '/',
            maxAge: 60 * 60 * 24 // 1 day
        });

        // Also store role for client-side redirect ease (optional, but keep it secure server-side)
        cookieStore.set('userRole', user.role, {
            path: '/',
            maxAge: 60 * 60 * 24
        });

        const { passwordHash: _, ...userWithoutPassword } = user;
        return NextResponse.json(userWithoutPassword);

    } catch (error) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
