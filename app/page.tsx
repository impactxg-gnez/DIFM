'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { MapPin, ArrowRight, CheckCircle, Search, Mic, Camera } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Home() {
    const router = useRouter();
    const [locationText, setLocationText] = useState('Location');
    const [isLoadingLocation, setIsLoadingLocation] = useState(false);

    const handleLocationClick = () => {
        setIsLoadingLocation(true);
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    // For now, minimal implementation to show it works
                    // In a real app, reverse geocode here
                    setLocationText('London'); // Placeholder for success
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
        <div className="relative w-full h-screen overflow-hidden bg-black font-sans text-white">
            {/* Background Image Placeholder */}
            {/* Replace 'url(...)' with actual image path or Next.js Image component */}
            <div
                className="absolute inset-0 bg-cover bg-center z-0"
                style={{
                    backgroundImage: 'url(/path/to/WhatsApp_Image_2026-01-18.jpg)', // Update this path
                    opacity: 0.6
                }}
            />
            {/* Fallback dark overlay if image fails or to improve text contrast */}
            <div className="absolute inset-0 bg-black/40 z-0" />


            {/* Top Navigation */}
            <div className="absolute top-8 right-6 z-20 flex gap-4">
                {/* Location Button */}
                <button
                    onClick={handleLocationClick}
                    className="flex items-center justify-center px-4 py-2 h-[38px] bg-white/5 border border-white/10 rounded-full backdrop-blur-sm hover:bg-white/10 transition-all font-semibold text-sm text-white/60 tracking-wide"
                >
                    {isLoadingLocation ? 'Locating...' : locationText}
                </button>

                {/* Login Button */}
                <button
                    onClick={() => router.push('/login')}
                    className="flex items-center justify-center px-4 py-2 h-[38px] bg-white/5 border border-white/10 rounded-full backdrop-blur-sm hover:bg-white/10 transition-all font-semibold text-sm text-white/60 tracking-wide"
                >
                    Login
                </button>
            </div>

            {/* Main Content Card - "Overlay+Border+Shadow+OverlayBlur" */}
            <div className="absolute top-[290px] left-4 right-4 md:left-[34px] md:right-[19px] md:w-[393px] md:mx-auto h-auto min-h-[380px] bg-[#1E1E20]/40 border border-white/10 rounded-[40px] backdrop-blur-[20px] shadow-[inset_0px_25px_50px_-12px_rgba(0,0,0,0.7)] flex flex-col p-7 z-10 box-border gap-7">

                {/* Icons/Graphic Placeholder (Untitled design (3) 1) */}
                {/* Assuming this is some hero graphic or mechanic illustration */}
                <div className="absolute -top-[200px] left-1/2 -translate-x-1/2 w-[191px] h-[191px] bg-contain bg-no-repeat bg-center opacity-90"
                    style={{ backgroundImage: 'url(/path/to/Untitled_design_3.png)' }} // Update path
                >
                    {/* Placeholder content if image missing */}
                    <div className="w-full h-full flex items-center justify-center text-xs text-center text-white/20 border border-white/10 rounded-full">
                        Hero Graphic
                    </div>
                </div>


                {/* Text: Fixed Upfront Price. No Calling Around */}
                <div className="absolute -top-[20px] left-1/2 -translate-x-1/2 w-max text-center">
                    <span className="text-white/40 text-sm font-medium">Fixed Upfront Price. No Calling Around</span>
                </div>


                {/* Heading Section */}
                <div className="flex flex-col gap-2 mt-4 text-center">
                    <h2 className="text-[28px] font-bold leading-8 tracking-tight text-white">
                        Book trusted local pros.<br />
                        We handle everything
                    </h2>
                    <p className="text-[11px] text-white/40 font-medium">
                        Fix a leaking tap, paint a bedroom, clean a 1 bed flat...
                    </p>
                </div>

                {/* Search Bar / Action Input */}
                <div className="relative w-full bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center justify-between h-[66px]">
                    <div className="flex items-center gap-3">
                        {/* Search Icon */}
                        <Search className="w-6 h-6 text-white/40" />
                        <span className="text-white/60 font-medium text-base">What needs doing?</span>
                    </div>
                    <div className="flex items-center gap-3 border-l border-white/10 pl-3">
                        <Mic className="w-5 h-5 text-white/40" />
                        <Camera className="w-5 h-5 text-white/40" />
                    </div>
                </div>

                {/* Features List */}
                <div className="flex flex-col gap-4 pl-2">
                    {/* Vetted Local Pros */}
                    <div className="flex items-center gap-4">
                        <div className="w-7 h-7 bg-blue-500/10 rounded-full flex items-center justify-center">
                            <CheckCircle className="w-[18px] h-[18px] text-blue-600 fill-blue-600/20" />
                        </div>
                        <span className="text-white font-semibold text-[15px]">Vetted Local Pros</span>
                    </div>

                    {/* Fixed Upfront Pricing */}
                    <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-4">
                            <div className="w-7 h-7 bg-blue-500/10 rounded-full flex items-center justify-center">
                                <CheckCircle className="w-[18px] h-[18px] text-blue-600 fill-blue-600/20" />
                            </div>
                            <span className="text-white font-semibold text-[15px]">Fixed Upfront Pricing</span>
                        </div>
                        <span className="pl-[44px] text-xs text-white/40">No Quotes</span>
                    </div>

                    {/* We handle no-shows */}
                    <div className="flex items-center gap-4">
                        <div className="w-7 h-7 bg-blue-500/10 rounded-full flex items-center justify-center">
                            {/* Shield Icon styling */}
                            <div className="relative w-[18px] h-[18px]">
                                <svg width="18" height="22" viewBox="0 0 18 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M9 20.3636C9 20.3636 15.75 16.9545 15.75 10.1364V4.45455L9 1.04545L2.25 4.45455V10.1364C2.25 16.9545 9 20.3636 9 20.3636Z" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </div>
                        </div>
                        <span className="text-white font-semibold text-xs">We handle no-shows, issues and disputes</span>
                    </div>
                </div>
            </div>

            {/* Example Price / Booking Flow (Bottom Card Layer) */}
            <div className="absolute top-[535px] left-4 right-4 md:left-[58px] md:w-[291px] h-[103px] bg-[#D9D9D9]/60 rounded-[22px] backdrop-blur-md p-4 text-black z-10 flex flex-col justify-between hidden md:flex">
                {/* This section matches "Rectangle 1" and its content from Figma, seemingly an active booking placeholder or promo */}
                <div className="flex justify-between items-start">
                    <div>
                        <div className="text-[10px] font-semibold opacity-60">Plumbing - Quick Fix (&lt;45 min)</div>
                        <div className="text-[12px] font-bold mt-0.5">Enter address...</div>
                    </div>
                    <div className="text-right">
                        <div className="text-[12px] font-bold">Upfront Price</div>
                        <div className="text-[12px] font-bold text-blue-600">£85.00</div>
                        <div className="text-[8px] font-bold text-blue-600">Change &gt;</div>
                    </div>
                </div>
                <div className="text-[10px] opacity-60 font-semibold border-t border-black/10 pt-1 mt-1">
                    Price locked when you book
                </div>
            </div>

            {/* Book Now Button Floating */}
            <div className="absolute top-[697px] left-1/2 -translate-x-1/2 z-20">
                <Button className="w-[146px] h-[56px] bg-[#007AFF] hover:bg-[#006ee6] rounded-full shadow-[0px_8px_25px_rgba(0,122,255,0.4)] flex items-center justify-center gap-2">
                    <CheckCircle className="w-5 h-5 text-white" />
                    <span className="text-[15px] font-bold text-white">Book Now</span>
                </Button>
            </div>

            {/* Footer Text */}
            <div className="absolute bottom-16 w-full text-center z-10 space-y-4 px-4">
                <p className="text-sm font-medium text-white/40">Don't Stress. Rest Assured. We'll do it for you.</p>
                <div className="flex justify-center flex-wrap gap-4 text-sm font-medium text-white/40">
                    <span>About Us</span>
                    <span>How It Works</span>
                    <span>FAQs</span>
                    <span>Trust & Safety</span>
                </div>
            </div>

            {/* CSS to ensure fonts and utilities map correctly if not standard Tailwind */}
            <style jsx global>{`
                /* Add Manrope font if needed, or use sans-serif default */
                @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap');
                body {
                    font-family: 'Manrope', sans-serif;
                }
            `}</style>
        </div>
    );
}

