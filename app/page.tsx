'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import useSWR from 'swr';
import { Search, MapPin, CheckCircle, Mic, Camera, ArrowRight, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function LandingPage() {
    const router = useRouter();
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [location, setLocation] = useState('');

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm), 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Fetch price preview
    const { data: pricePreview, isLoading: priceLoading } = useSWR(
        debouncedSearch.length > 2 ? `/api/pricing/preview?description=${encodeURIComponent(debouncedSearch)}` : null,
        fetcher
    );

    const handleBookNow = () => {
        const params = new URLSearchParams();
        if (debouncedSearch) params.set('desc', debouncedSearch);
        if (location) params.set('loc', location);
        router.push(`/login?${params.toString()}`);
    };

    return (
        <div className="min-h-screen bg-black text-white flex flex-col font-sans selection:bg-blue-600/30">
            {/* Nav */}
            <header className="p-6 flex justify-between items-center max-w-7xl mx-auto w-full z-10">
                <div className="text-2xl font-black tracking-tighter text-white">DIFM.</div>
                <Button
                    variant="ghost"
                    className="text-white hover:text-blue-400 hover:bg-white/5"
                    onClick={() => router.push('/login')}
                >
                    Log In
                </Button>
            </header>

            {/* Main Content */}
            <main className="flex-1 flex flex-col items-center justify-center p-4 relative z-10 max-w-xl mx-auto w-full -mt-20">

                {/* Headlines */}
                <div className="text-center space-y-4 mb-8">
                    <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight">
                        Book trusted Local Pros.<br />
                        <span className="text-blue-500">We Handle everything.</span>
                    </h1>
                    <p className="text-gray-400 text-lg">
                        Instant Fixed Price - No Calling Around - We'll do it for you
                    </p>
                </div>

                {/* Main Interaction Card */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full bg-[#121417] p-1 rounded-[2rem] border border-white/10 shadow-2xl relative overflow-hidden"
                >
                    <div className="bg-gradient-to-b from-white/5 to-transparent absolute inset-0 pointer-events-none" />

                    <div className="p-6 space-y-6 relative">
                        {/* Search Input */}
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-500" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="What needs doing?"
                                className="w-full bg-transparent text-xl placeholder:text-gray-500 text-white font-medium pl-14 pr-20 py-4 outline-none border-b border-white/10 focus:border-blue-500 transition-colors"
                            />
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex gap-3 text-gray-500">
                                <Mic className="w-5 h-5 cursor-pointer hover:text-white transition-colors" />
                                <Camera className="w-5 h-5 cursor-pointer hover:text-white transition-colors" />
                            </div>
                        </div>

                        {/* Example Text */}
                        {!searchTerm && (
                            <p className="text-sm text-gray-600 pl-4">
                                Fix leaking tap, paint bedroom, clean 1 bed flat...
                            </p>
                        )}

                        {/* Trust Checklist */}
                        <div className="space-y-3 pl-2">
                            <div className="flex items-center gap-3">
                                <div className="bg-blue-600 rounded-full p-0.5">
                                    <CheckCircle className="w-4 h-4 text-white fill-blue-600" />
                                </div>
                                <span className="text-gray-300 font-medium">Vetted local pros</span>
                            </div>
                            <div className="flex items-start gap-3">
                                <div className="bg-blue-600 rounded-full p-0.5 mt-0.5">
                                    <CheckCircle className="w-4 h-4 text-white fill-blue-600" />
                                </div>
                                <div>
                                    <span className="text-gray-300 font-medium">Fixed upfront pricing</span>
                                    <p className="text-xs text-gray-500 ml-1">• No quotes</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="bg-blue-600 rounded-full p-0.5">
                                    <CheckCircle className="w-4 h-4 text-white fill-blue-600" />
                                </div>
                                <span className="text-gray-300 font-medium">We cover no-shows, issues and disputes</span>
                            </div>
                        </div>

                        {/* Price Preview Card */}
                        <AnimatePresence>
                            {(pricePreview || searchTerm) && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                >
                                    <div className="bg-gray-200 rounded-2xl p-4 text-gray-900 mt-2">
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="font-semibold text-lg">Price estimate</span>
                                            {priceLoading ? (
                                                <span className="text-blue-600 font-bold animate-pulse">Computing...</span>
                                            ) : (
                                                <span className="text-blue-900 font-bold text-2xl">
                                                    £{pricePreview?.totalPrice?.toFixed(2) || '0.00'}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex justify-between items-end">
                                            <div className="text-sm text-gray-600">
                                                <p>{pricePreview?.items?.[0]?.itemType || 'General Service'}</p>
                                                <p className="text-xs mt-1 opacity-75">Price locked when you book</p>
                                            </div>
                                            <button className="text-blue-700 font-semibold text-sm hover:underline flex items-center gap-1">
                                                Change <ArrowRight className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Location Input */}
                        <div className="bg-white/5 rounded-xl flex items-center p-3 border border-white/5 focus-within:border-blue-500/50 transition-colors">
                            <MapPin className="w-5 h-5 text-gray-400 mr-3" />
                            <input
                                type="text"
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                placeholder="Enter address..."
                                className="bg-transparent w-full text-white placeholder:text-gray-500 outline-none"
                            />
                        </div>
                    </div>
                </motion.div>

                {/* CTA Button */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="w-full mt-8"
                >
                    <Button
                        onClick={handleBookNow}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-7 text-xl rounded-2xl shadow-[0_0_40px_-5px_rgba(37,99,235,0.6)] transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                        Book now
                    </Button>
                </motion.div>

                {/* Footer Tagline */}
                <p className="mt-8 text-gray-500 text-sm font-medium tracking-wide">
                    Don't stress. Rest Assured. We'll do it for YOU!
                </p>

            </main>
        </div>
    );
}
