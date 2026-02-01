'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Search, Mic, Camera, CheckCircle } from 'lucide-react';
import { AddressModal } from '@/components/AddressModal';

export default function Home() {
    const router = useRouter();
    const [locationText, setLocationText] = useState('Location');
    const [isLoadingLocation, setIsLoadingLocation] = useState(false);

    // Search & Pricing State
    const [description, setDescription] = useState('');
    const [debouncedDesc, setDebouncedDesc] = useState('');
    const [pricePreview, setPricePreview] = useState<any>(null);
    const [isPricingLoading, setIsPricingLoading] = useState(false);

    // Modal State
    const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
    const [selectedAddress, setSelectedAddress] = useState('');

    // Debounce description input
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedDesc(description);
        }, 500);
        return () => clearTimeout(timer);
    }, [description]);

    // Fetch Price Prediction
    useEffect(() => {
        const fetchPrice = async () => {
            if (!debouncedDesc.trim()) {
                setPricePreview(null);
                return;
            }

            setIsPricingLoading(true);
            try {
                const res = await fetch('/api/pricing/preview', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ category: 'HANDYMAN', description: debouncedDesc }),
                });
                if (res.ok) {
                    const data = await res.json();
                    setPricePreview(data);
                }
            } catch (error) {
                console.error('Failed to fetch price:', error);
            } finally {
                setIsPricingLoading(false);
            }
        };

        fetchPrice();
    }, [debouncedDesc]);

    const handleLocationClick = () => {
        setIsLoadingLocation(true);
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setLocationText('London'); // Placeholder
                    setIsLoadingLocation(false);
                },
                (error) => {
                    console.error('Error getting location:', error);
                    setLocationText('Unavailable');
                    setIsLoadingLocation(false);
                }
            );
        } else {
            setIsLoadingLocation(false);
        }
    };

    const handleAddressClick = () => {
        setIsAddressModalOpen(true);
    };

    const handleAddressSave = (address: string) => {
        setSelectedAddress(address);
    };

    const handleBookNow = () => {
        router.push('/finding-pro');
    };

    const handleMediaClick = (type: 'mic' | 'camera') => {
        alert(`${type === 'mic' ? 'Voice Note' : 'Camera'} upload coming soon!`);
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

                    {/* Search Bar - Dynamic Input */}
                    <div className="w-full bg-[#1E1E20] border border-white/10 rounded-2xl h-[52px] flex items-center px-4 transition-colors focus-within:border-blue-500/50">
                        <Search className="w-5 h-5 text-gray-500 mr-3" />
                        <input
                            type="text"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="What needs doing?"
                            className="bg-transparent text-white placeholder:text-gray-500 text-sm flex-1 outline-none"
                        />
                        <div className="flex items-center gap-3 pl-3 border-l border-white/10 ml-2">
                            <Mic className="w-4 h-4 text-gray-400 cursor-pointer hover:text-white transition-colors" onClick={() => handleMediaClick('mic')} />
                            <Camera className="w-4 h-4 text-gray-400 cursor-pointer hover:text-white transition-colors" onClick={() => handleMediaClick('camera')} />
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

                    {/* Upfront Price Card - Dynamic */}
                    {(pricePreview || isPricingLoading) && (
                        <div className="bg-[#D9D9D9] rounded-[24px] p-4 text-black relative overflow-hidden mt-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="flex justify-between items-start mb-6">
                                <div className="flex flex-col max-w-[70%]">
                                    <span className="text-[10px] font-bold text-black/70 uppercase tracking-wider">Upfront Price</span>
                                    <span className="text-[11px] font-semibold text-black/80 mt-1 truncate">
                                        {isPricingLoading ? 'Calculating...' : (pricePreview?.items?.[0]?.description || description || 'Custom Job')}
                                    </span>
                                    <span className="text-[10px] text-black/50">Price locked when you book</span>
                                </div>
                                <div className="text-right flex flex-col items-end shrink-0">
                                    <span className="text-[#007AFF] font-bold text-sm">
                                        {isPricingLoading ? '...' : `£${pricePreview?.totalPrice?.toFixed(2) || '0.00'}`}
                                    </span>
                                    {!isPricingLoading && <span className="text-[#007AFF] text-[9px] font-bold cursor-pointer hover:underline">Change &gt;</span>}
                                </div>
                            </div>

                            {/* Enter Address Button (Inside the card bottom) */}
                            <div
                                onClick={handleAddressClick}
                                className={`w-full h-[48px] rounded-[16px] flex items-center justify-center cursor-pointer transition-colors ${selectedAddress ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-black/10 hover:bg-black/15'}`}
                            >
                                <span className={`font-bold text-sm ${selectedAddress ? 'text-white' : 'text-black'}`}>
                                    {selectedAddress || 'Enter address...'}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Floating Action Button */}
                <div className="mt-8">
                    <Button
                        onClick={handleBookNow}
                        className="px-8 h-[56px] bg-[#007AFF] hover:bg-[#006ee6] rounded-full shadow-[0px_8px_30px_rgba(0,122,255,0.4)] flex items-center gap-2"
                    >
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

            {/* Address Modal */}
            <AddressModal
                isOpen={isAddressModalOpen}
                onClose={() => setIsAddressModalOpen(false)}
                onSave={handleAddressSave}
            />

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
