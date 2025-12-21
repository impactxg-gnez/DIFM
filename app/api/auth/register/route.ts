import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createHash } from 'crypto';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { email, password, name, role } = body;

        // Basic validation
        if (!email || !password || !name || !role) {
            return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
        }

        // Role validation
        const validRoles = ['CUSTOMER', 'PROVIDER', 'ADMIN'];
        if (!validRoles.includes(role)) {
            return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
        }

        // Hash password (SHA256 for demo simplicity/no-deps)
        const passwordHash = createHash('sha256').update(password).digest('hex');

        // Create user
        try {
            const user = await prisma.user.create({
                data: {
                    email,
                    name,
                    passwordHash,
                    role: role as any,
                    isOnline: role === 'PROVIDER' ? true : false, // Default providers to online for easy testing
                },
            });

            // return user without password
            const { passwordHash: _, ...userWithoutPassword } = user;
            return NextResponse.json(userWithoutPassword);
        } catch (e: any) {
            console.error(e);
            if (e.code === 'P2002') {
                return NextResponse.json({ error: 'User already exists' }, { status: 409 });
            }
            throw e;
        }

    } catch (error) {
        console.error('Registration error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
