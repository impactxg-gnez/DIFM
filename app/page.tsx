'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Search, Mic, Camera, Check, MapPin, ChevronRight, Hammer, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function LandingPage() {
    const router = useRouter();
    const [description, setDescription] = useState('');
    const [location, setLocation] = useState('');
    const [debouncedDesc, setDebouncedDesc] = useState('');

    // Debounce description for price preview
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedDesc(description), 500);
        return () => clearTimeout(timer);
    }, [description]);

    // Fetch price preview
    const fetcher = async () => {
        if (!debouncedDesc.trim()) return null;
        try {
            const res = await fetch('/api/pricing/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category: 'HANDYMAN', description: debouncedDesc }),
            });
            if (!res.ok) return null;
            return res.json();
        } catch (e) {
            return null;
        }
    };

    const { data: pricePreview, isLoading: priceLoading } = useSWR(
        debouncedDesc ? ['price-preview', debouncedDesc] : null,
        fetcher,
        { refreshInterval: 0 }
    );

    const handleBookNow = () => {
        // For now, just redirect to login as per instructions
        router.push('/login');
    };

    return (
        <div className="min-h-screen bg-[#121417] text-white flex flex-col font-sans selection:bg-blue-500/30">
            {/* Background Texture/Gradient */}
            <div className="fixed inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none"></div>
            <div className="fixed inset-0 bg-gradient-to-b from-[#1a1f2e] to-[#121417] -z-10"></div>

            {/* Main Content */}
            <main className="flex-1 flex flex-col items-center justify-center p-6 relative z-10 max-w-md mx-auto w-full">

                {/* Logo & Headline */}
                <div className="text-center mb-8 space-y-2">
                    <div className="flex justify-center mb-4">
                        <div className="relative">
                            <div className="flex gap-1 items-end">
                                <User className="w-12 h-12 text-white fill-white" />
                                <Hammer className="w-10 h-10 text-white fill-current -ml-2 mb-1" />
                            </div>
                        </div>
                    </div>
                    <h1 className="text-5xl font-black tracking-tighter text-white mb-1">DIFM</h1>
                    <p className="text-gray-400 font-medium tracking-widest text-sm uppercase">Do it For Me</p>

                    <div className="mt-8 space-y-1">
                        <p className="text-xl font-medium text-gray-200">Book trusted local pros. We handle everything.</p>
                        <p className="text-sm text-gray-400">Instant fixed price • No calling around • We'll do it for you.</p>
                    </div>
                </div>

                {/* Interactive Card */}
                <div className="w-full bg-[#1c212c]/90 backdrop-blur-xl border border-white/10 rounded-3xl p-1 shadow-2xl overflow-hidden ring-1 ring-white/5">

                    {/* Input Area */}
                    <div className="p-4 space-y-4">
                        <div className="relative group">
                            <Search className="absolute left-3 top-3.5 w-5 h-5 text-gray-400 group-focus-within:text-blue-400 transition-colors" />
                            <input
                                type="text"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="What needs doing?"
                                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-12 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all font-medium"
                            />
                            <div className="absolute right-3 top-2.5 flex gap-2 text-gray-500">
                                <Mic className="w-5 h-5 hover:text-white cursor-pointer transition-colors" />
                                <Camera className="w-5 h-5 hover:text-white cursor-pointer transition-colors" />
                            </div>
                            <div className="mt-2 pl-1">
                                <p className="text-xs text-gray-500 truncate">Fix leaking tap, paint bedroom, clean 1 bed flat...</p>
                            </div>
                        </div>

                        {/* Trust Signals */}
                        <div className="space-y-2 py-2">
                            {[
                                { text: 'Vetted local pros', bold: true },
                                { text: 'Fixed upfront pricing', sub: '• No quotes', bold: true },
                                { text: 'We cover no-shows, issues and disputes', bold: true }
                            ].map((item, i) => (
                                <div key={i} className="flex items-start gap-3">
                                    <div className="mt-0.5 bg-blue-600 rounded-full p-0.5">
                                        <Check className="w-3 h-3 text-white" strokeWidth={4} />
                                    </div>
                                    <div className="text-sm text-gray-300">
                                        <span className={item.bold ? 'font-medium text-gray-200' : ''}>{item.text}</span>
                                        {item.sub && <div className="text-gray-500 text-xs mt-0.5 pl-1">{item.sub}</div>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Price Estimation Box */}
                    <div className="bg-gradient-to-r from-gray-100 to-gray-200 m-2 rounded-xl p-4 text-gray-900 border border-white/20 shadow-inner">
                        <div className="flex justify-between items-start mb-1">
                            <div>
                                <h3 className="font-bold text-gray-900">Price estimate</h3>
                                <p className="text-sm text-gray-600 font-medium">
                                    {description ? 'Based on your request' : 'Plumbing — Quick Fix (<45 min)'}
                                </p>
                            </div>
                            <div className="text-right">
                                <div className="text-xl font-bold text-[#0f172a]">
                                    {priceLoading ? '...' : (pricePreview?.totalPrice ? `£${pricePreview.totalPrice.toFixed(2)}` : '£85.00')}
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-between items-center mt-2">
                            <p className="text-xs text-gray-500">Price locked when you book</p>
                            <button className="text-xs font-semibold text-blue-700 hover:underline flex items-center">
                                Change <ChevronRight className="w-3 h-3 ml-0.5" />
                            </button>
                        </div>
                    </div>

                    {/* Location Input (Visual) */}
                    <div className="px-4 pb-4">
                        <div className="relative">
                            <MapPin className="absolute left-3 top-3 w-5 h-5 text-gray-500" />
                            <input
                                type="text"
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                placeholder="Enter address..."
                                className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all text-sm"
                            />
                        </div>
                    </div>
                </div>

                {/* CTA Button */}
                <Button
                    onClick={handleBookNow}
                    className="w-full max-w-xs mt-8 bg-blue-600 hover:bg-blue-500 text-white font-bold py-6 text-lg rounded-2xl shadow-[0_10px_30px_-10px_rgba(37,99,235,0.5)] transition-all hover:scale-105 active:scale-95"
                >
                    Book now
                </Button>

                {/* Footer Text */}
                <div className="mt-8 text-center space-y-4">
                    <p className="text-gray-400 text-sm">Don't stress. Rest assured, we'll do it for you.</p>

                    <div className="flex justify-center gap-4 text-xs text-gray-500 flex-wrap">
                        <span className="cursor-pointer hover:text-gray-300 transition-colors">About us</span> •
                        <span className="cursor-pointer hover:text-gray-300 transition-colors">How it works</span> •
                        <span className="cursor-pointer hover:text-gray-300 transition-colors">FAQs</span> •
                        <span className="cursor-pointer hover:text-gray-300 transition-colors">Trust & Safety</span>
                    </div>
                </div>

            </main>
        </div>
    );
}

