'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { CustomerView } from '@/components/dashboard/CustomerView';
import { ProviderView } from '@/components/dashboard/ProviderView';
import { AdminView } from '@/components/dashboard/AdminView';

const fetcher = (url: string) => fetch(url).then((res) => {
    if (!res.ok) throw new Error('Unauthorized');
    return res.json();
});

export default function DashboardPage() {
    const router = useRouter();
    const [locationRequested, setLocationRequested] = useState(false);

    // Use SWR for real-time user data updates (poll every 3 seconds)
    const { data: user, error, isLoading } = useSWR('/api/user/me', fetcher, {
        refreshInterval: 3000, // Poll every 3 seconds for real-time updates
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
    });

    // Redirect to login on error
    useEffect(() => {
        if (error) {
            router.push('/login');
        }
    }, [error, router]);

    // Prompt for location as soon as user is known (on login)
    useEffect(() => {
        if (!user || locationRequested) return;
        if (typeof navigator === 'undefined' || !navigator.geolocation) return;

        setLocationRequested(true);

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                try {
                    await fetch('/api/user/location', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude,
                        }),
                    });
                } catch (e) {
                    console.error('Failed to save location', e);
                }
            },
            (error) => {
                console.warn('Location permission denied or failed', error);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    }, [user, locationRequested]);

    const handleLogout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.push('/login');
    };

    if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
    if (!user) return null;

    return (
        <div className="min-h-screen bg-[#1E1E20] font-sans selection:bg-blue-600/30">
            {/* Header - Hidden for Customers */}
            {user.role !== 'CUSTOMER' && (
                <header className="bg-[#121417] border-b border-white/10 h-16 px-8 flex justify-between items-center sticky top-0 z-10 shadow-sm">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">D</div>
                        <h1 className="text-xl font-bold tracking-tight text-white">DIFM</h1>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-right hidden sm:block">
                            <p className="text-sm font-medium text-white">{user.name}</p>
                            <p className="text-xs text-gray-400 lowercase">{user.role}</p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={handleLogout} className="text-gray-400 hover:text-white hover:bg-white/5">Log out</Button>
                    </div>
                </header>
            )}

            <main className={user.role === 'CUSTOMER' ? 'p-0' : 'max-w-5xl mx-auto p-6 sm:p-10'}>
                {user.role === 'CUSTOMER' && <CustomerView user={user} />}
                {user.role === 'PROVIDER' && <ProviderView user={user} />}
                {user.role === 'ADMIN' && <AdminView user={user} />}
            </main>
        </div>
    );
}
