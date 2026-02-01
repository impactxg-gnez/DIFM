'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Search, Mic, Camera, CheckCircle } from 'lucide-react';

export default function Home() {
    const router = useRouter();
    const [locationText, setLocationText] = useState('Location');
    const [isLoadingLocation, setIsLoadingLocation] = useState(false);

    // Placeholder state for pricing - in real app this would depend on search selection
    const [showPrice, setShowPrice] = useState(true);

    const handleLocationClick = () => {
        setIsLoadingLocation(true);
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    // Placeholder success
                    setLocationText('London');
                    setIsLoadingLocation(false);
                },
                (error) => {
                    console.error('Error getting location:', error);
                    setLocationText('Unavailable');
                    setIsLoadingLocation(false);
                }
            );
        } else {
            console.error('Geolocation is not supported by this browser.');
            setIsLoadingLocation(false);
        }
    };

    return (
        <div className="relative w-full min-h-screen bg-[#1E1E20] font-sans text-white overflow-x-hidden">
            {/* Background Texture - Full Coverage */}
            <div
                className="fixed inset-0 bg-cover bg-center z-0"
                style={{
                    backgroundImage: 'url(/home-bg.jpg)',
                }}
            />
            {/* Dark Overlay */}
            <div className="fixed inset-0 bg-black/60 z-0" />

            {/* Header: Location (Top Left) & Login (Top Right) */}
            <div className="absolute top-8 left-6 z-20">
                <button
                    onClick={handleLocationClick}
                    className="flex items-center justify-center px-6 py-2 h-[44px] bg-white/5 border border-white/10 rounded-full backdrop-blur-md hover:bg-white/10 transition-all font-semibold text-sm text-white/80 tracking-wide"
                >
                    {isLoadingLocation ? 'Locating...' : locationText}
                </button>
            </div>

            <div className="absolute top-8 right-6 z-20">
                <button
                    onClick={() => router.push('/login')}
                    className="flex items-center justify-center px-6 py-2 h-[44px] bg-white/5 border border-white/10 rounded-full backdrop-blur-md hover:bg-white/10 transition-all font-semibold text-sm text-white/80 tracking-wide"
                >
                    Login
                </button>
            </div>

            {/* Scrollable Main Content Wrapper */}
            <div className="relative z-10 w-full flex flex-col items-center pt-[120px] pb-32 px-4 md:px-0">

                {/* Hero Graphic */}
                <div className="w-[180px] h-[180px] mb-4 flex items-center justify-center">
                    <img
                        src="/hero-graphic.png"
                        alt="DIFM Hero"
                        className="w-full h-full object-contain drop-shadow-2xl"
                    />
                </div>

                {/* Sub-Hero Tagline */}
                <p className="text-white/50 text-sm font-medium tracking-wide mb-8 text-center">
                    Fixed Upfront Price. No Calling Around
                </p>

                {/* Main Modal Card */}
                <div className="w-full max-w-[400px] bg-[#121212] rounded-[32px] p-6 border border-white/5 shadow-2xl flex flex-col gap-6">

                    {/* Modal Heading */}
                    <div className="text-center">
                        <h1 className="text-3xl font-bold text-white leading-[1.2] mb-2">
                            Book trusted local pros.<br />
                            We handle everything
                        </h1>
                        <p className="text-white/40 text-xs">
                            Fix a leaking tap, paint a bedroom, clean a 1 bed flat...
                        </p>
                    </div>

                    {/* Search Bar */}
                    <div className="w-full bg-[#1E1E20] border border-white/10 rounded-2xl h-[52px] flex items-center px-4">
                        <Search className="w-5 h-5 text-gray-500 mr-3" />
                        <input
                            type="text"
                            placeholder="What needs doing?"
                            className="bg-transparent text-white placeholder:text-gray-500 text-sm flex-1 outline-none"
                        />
                        <div className="flex items-center gap-3 pl-3 border-l border-white/10 ml-2">
                            <Mic className="w-4 h-4 text-gray-400" />
                            <Camera className="w-4 h-4 text-gray-400" />
                        </div>
                    </div>

                    {/* Checklist */}
                    <div className="space-y-3.5 pl-1">
                        <div className="flex items-center gap-3">
                            <div className="bg-blue-600/20 p-1 rounded-full"><CheckCircle className="w-4 h-4 text-blue-500" /></div>
                            <span className="text-white font-semibold text-sm">Vetted Local Pros</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="bg-blue-600/20 p-1 rounded-full"><CheckCircle className="w-4 h-4 text-blue-500" /></div>
                            <div className="flex flex-col">
                                <span className="text-white font-semibold text-sm leading-none">Fixed Upfront Pricing</span>
                                <span className="text-white/30 text-[10px] mt-0.5">No Quotes</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="bg-blue-600/20 p-1 rounded-full">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500 w-4 h-4"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                            </div>
                            <span className="text-white font-semibold text-sm">We handle no-shows, issues and disputes</span>
                        </div>
                    </div>

                    {/* Upfront Price Card (Placeholder - only visible if showPrice is true) */}
                    {showPrice && (
                        <div className="bg-[#D9D9D9] rounded-[24px] p-4 text-black relative overflow-hidden mt-2">
                            <div className="flex justify-between items-start mb-6">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-bold text-black/70 uppercase tracking-wider">Upfront Price</span>
                                    <span className="text-[11px] font-semibold text-black/80 mt-1">Plumbing - Quick Fix (&lt; 45 min)</span>
                                    <span className="text-[10px] text-black/50">Price locked when you book</span>
                                </div>
                                <div className="text-right flex flex-col items-end">
                                    <span className="text-[#007AFF] font-bold text-sm">£85.00</span>
                                    <span className="text-[#007AFF] text-[9px] font-bold cursor-pointer hover:underline">Change &gt;</span>
                                </div>
                            </div>

                            {/* Enter Address Button (Inside the card bottom) */}
                            <div className="w-full h-[48px] bg-black/10 rounded-[16px] flex items-center justify-center cursor-pointer hover:bg-black/15 transition-colors">
                                <span className="text-black font-bold text-sm">Enter address...</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Floating Action Button */}
                <div className="mt-8">
                    <Button className="px-8 h-[56px] bg-[#007AFF] hover:bg-[#006ee6] rounded-full shadow-[0px_8px_30px_rgba(0,122,255,0.4)] flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-white" />
                        <span className="text-base font-bold text-white">Book Now</span>
                    </Button>
                </div>

                {/* Footer Info */}
                <div className="mt-12 text-center space-y-3">
                    <p className="text-white/40 text-xs font-medium">Don't Stress. Rest Assured. We'll do it for you.</p>
                    <div className="flex justify-center gap-4 text-[10px] text-white/40 font-medium">
                        <span className="cursor-pointer hover:text-white transition-colors">About Us</span>
                        <span className="cursor-pointer hover:text-white transition-colors">How It Works</span>
                        <span className="cursor-pointer hover:text-white transition-colors">FAQs</span>
                        <span className="cursor-pointer hover:text-white transition-colors">Trust & Safety</span>
                    </div>
                </div>

            </div>

            {/* Global Styles */}
            <style jsx global>{`
                @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');
                body { font-family: 'Manrope', sans-serif; }
            `}</style>
        </div>
    );
}
