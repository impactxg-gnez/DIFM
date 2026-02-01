'use client';

import { useRouter } from 'next/navigation';
import { HomeSearchInterface } from '@/components/dashboard/HomeSearchInterface';

export default function Home() {
    const router = useRouter();

    const handleBookNow = (data: { description: string; address: string; label?: string; pricePrediction?: any }) => {
        // Save pending job data to localStorage
        localStorage.setItem('pendingJob', JSON.stringify({
            ...data,
            timestamp: Date.now()
        }));

        // Redirect to login/signup
        router.push('/login');
    };

    return (
        <div className="relative w-full min-h-screen bg-[#1E1E20]">
            {/* Background Texture - Shared */}
            <div
                className="fixed inset-0 bg-cover bg-center z-0"
                style={{
                    backgroundImage: 'url(/home-bg.jpg)',
                }}
            />
            {/* Dark Overlay */}
            <div className="fixed inset-0 bg-black/60 z-0" />

            {/* Main Interface */}
            <div className="relative z-10">
                <HomeSearchInterface
                    onBookNow={handleBookNow}
                    showLoginButton={true}
                    onLoginClick={() => router.push('/login')}
                />
            </div>

            {/* Global Styles */}
            <style jsx global>{`
                @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');
                body { font-family: 'Manrope', sans-serif; }
                .scrollbar-none::-webkit-scrollbar { display: none; }
                .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </div>
    );
}
