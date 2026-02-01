'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function FindingPro() {
    const router = useRouter();

    useEffect(() => {
        // Simulation of finding a pro
        const timer = setTimeout(() => {
            // router.push('/job-confirmed'); // Future step
        }, 3000);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#1E1E20] text-white">
            <div className="animate-pulse flex flex-col items-center gap-6">
                <div className="w-24 h-24 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
                <h1 className="text-2xl font-bold">Finding a local pro...</h1>
                <p className="text-white/50">We are broadcasting your request to top-rated pros in your area.</p>
            </div>
        </div>
    );
}
