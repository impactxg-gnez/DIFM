'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Search, Mic, Camera, CheckCircle } from 'lucide-react';
// import { motion } from 'framer-motion'; 

export default function Home() {
    const router = useRouter();
    const [locationText, setLocationText] = useState('Location');
    const [isLoadingLocation, setIsLoadingLocation] = useState(false);

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
        <div className="relative w-full h-screen overflow-hidden bg-[#1E1E20] font-sans text-white">
            {/* Background Texture */}
            <div
                className="absolute inset-0 bg-cover bg-center z-0"
                style={{
                    backgroundImage: 'url(/home-bg.jpg)',
                }}
            />
            {/* Dark Overlay to ensure text readability matching screenshot */}
            <div className="absolute inset-0 bg-black/50 z-0" />

            {/* Top Navigation */}
            <div className="absolute top-8 right-6 z-20 flex gap-4">
                <button
                    onClick={handleLocationClick}
                    className="flex items-center justify-center px-6 py-2 h-[38px] bg-white/5 border border-white/10 rounded-full backdrop-blur-md hover:bg-white/10 transition-all font-semibold text-sm text-white/80 tracking-wide"
                >
                    {isLoadingLocation ? 'Locating...' : locationText}
                </button>
                <button
                    onClick={() => router.push('/login')}
                    className="flex items-center justify-center px-6 py-2 h-[38px] bg-white/5 border border-white/10 rounded-full backdrop-blur-md hover:bg-white/10 transition-all font-semibold text-sm text-white/80 tracking-wide"
                >
                    Login
                </button>
            </div>

            {/* Hero Graphic - Centered at top */}
            <div className="absolute top-[12%] left-1/2 -translate-x-1/2 w-[220px] h-[220px] z-10 flex flex-col items-center">
                <img
                    src="/hero-graphic.png"
                    alt="DIFM Hero"
                    className="w-full h-full object-contain drop-shadow-2xl"
                />
            </div>

            {/* Fixed Upfront Price Tagline - Below graphic */}
            <div className="absolute top-[35%] w-full text-center z-10">
                <span className="text-white/60 text-sm font-medium tracking-wide">Fixed Upfront Price. No Calling Around</span>
            </div>

            {/* Bottom Card - The main interaction area */}
            <div className="absolute bottom-[-20px] left-0 right-0 h-[62%] bg-[#121212] rounded-t-[40px] shadow-[0_-10px_40px_rgba(0,0,0,0.5)] border-t border-white/5 p-6 flex flex-col items-center z-20">

                {/* Heading */}
                <div className="text-center mt-6 mb-6">
                    <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight mb-2">
                        Book trusted local pros.<br />
                        We handle everything
                    </h1>
                    <p className="text-white/40 text-xs md:text-sm">
                        Fix a leaking tap, paint a bedroom, clean a 1 bed flat...
                    </p>
                </div>

                {/* Search Bar */}
                <div className="w-full max-w-md bg-[#1E1E20] border border-white/5 rounded-2xl h-[56px] flex items-center px-4 mb-8">
                    <Search className="w-5 h-5 text-gray-400 mr-3" />
                    <input
                        type="text"
                        placeholder="What needs doing?"
                        className="bg-transparent text-white placeholder:text-gray-500 text-base flex-1 outline-none"
                    />
                    <div className="flex items-center gap-3 pl-3 border-l border-white/10 ml-2">
                        <Mic className="w-5 h-5 text-gray-400" />
                        <Camera className="w-5 h-5 text-gray-400" />
                    </div>
                </div>

                {/* Checklist items */}
                <div className="w-full max-w-md space-y-4 mb-8 pl-2">
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

                {/* Example Price Card - Hovering above Address */}
                <div className="w-full max-w-[340px] bg-white/90 rounded-[24px] p-4 flex items-center justify-between mb-0 overflow-hidden relative z-30 shadow-lg">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-black/70">Upfront Price</span>
                        <span className="text-[11px] font-semibold text-black/60">Plumbing - Quick Fix (&lt; 45 min)</span>
                        <span className="text-[10px] text-black/40 mt-1">Price locked when you book</span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-blue-600 font-bold text-sm">£85.00</span>
                        <span className="text-blue-500 text-[9px] font-bold cursor-pointer">Change &gt;</span>
                    </div>
                </div>

                {/* Enter Address Bar (Visual overlap with Price Card in design, implementing as stacked for now to be safe) */}
                <div className="w-full max-w-[340px] bg-white/80 h-[40px] rounded-b-[24px] -mt-5 pt-6 pb-2 px-4 flex items-center justify-center backdrop-blur-sm z-20 mb-8">
                    <span className="text-black font-bold text-sm">Enter address...</span>
                </div>

                {/* Book Now Button */}
                <div className="absolute bottom-[10%] left-1/2 -translate-x-1/2 z-40">
                    <Button className="w-[160px] h-[52px] bg-[#007AFF] hover:bg-[#006ee6] rounded-full shadow-[0px_4px_20px_rgba(0,122,255,0.5)] flex items-center justify-center gap-2">
                        <CheckCircle className="w-5 h-5 text-white" />
                        <span className="text-base font-bold text-white">Book Now</span>
                    </Button>
                </div>

                {/* Footer visual text */}
                <div className="absolute bottom-4 w-full text-center space-y-2">
                    <p className="text-white/30 textxs">Don't Stress. Rest Assured. We'll do it for you.</p>
                    <div className="flex justify-center gap-3 text-[10px] text-white/30">
                        <span>About Us</span>
                        <span>How It Works</span>
                        <span>FAQs</span>
                        <span>Trust & Safety</span>
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
