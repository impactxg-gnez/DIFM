'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { CustomerView } from '@/components/dashboard/CustomerView';
import { ProviderView } from '@/components/dashboard/ProviderView';
import { AdminView } from '@/components/dashboard/AdminView';

export default function DashboardPage() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/user/me')
            .then((res) => {
                if (!res.ok) throw new Error('Unauthorized');
                return res.json();
            })
            .then((data) => setUser(data))
            .catch(() => router.push('/login'))
            .finally(() => setLoading(false));
    }, [router]);

    const handleLogout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.push('/login');
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
    if (!user) return null;

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <header className="bg-white border-b h-16 px-8 flex justify-between items-center sticky top-0 z-10 shadow-sm">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white font-bold">D</div>
                    <h1 className="text-xl font-bold tracking-tight text-gray-900">DIFM</h1>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right hidden sm:block">
                        <p className="text-sm font-medium text-gray-900">{user.name}</p>
                        <p className="text-xs text-gray-500 lowercase">{user.role}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={handleLogout} className="text-gray-900 hover:text-gray-700">Log out</Button>
                </div>
            </header>

            <main className="max-w-5xl mx-auto p-6 sm:p-10">
                {user.role === 'CUSTOMER' && <CustomerView user={user} />}
                {user.role === 'PROVIDER' && <ProviderView user={user} />}
                {user.role === 'ADMIN' && <AdminView user={user} />}
            </main>
        </div>
    );
}
