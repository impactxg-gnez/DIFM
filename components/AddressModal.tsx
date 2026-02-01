'use client';

import { useState } from 'react';
import { X, ChevronLeft, Map, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface AddressModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (address: string) => void;
}

export function AddressModal({ isOpen, onClose, onSave }: AddressModalProps) {
    const [address, setAddress] = useState('');
    const [apt, setApt] = useState('');
    const [label, setLabel] = useState('Home');
    const [customLabel, setCustomLabel] = useState('');

    if (!isOpen) return null;

    const handleSave = () => {
        if (!address.trim()) return;
        // Combine details for now, or pass structured object
        const fullAddress = `${address}${apt ? `, ${apt}` : ''}`;
        onSave(fullAddress);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-[#1E1E20] border border-white/10 rounded-[32px] overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="p-6 pb-2">
                    <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors mb-6">
                        <ChevronLeft className="w-6 h-6 text-white" />
                    </button>
                    <div className="space-y-1">
                        <span className="text-blue-500 text-xs font-bold tracking-widest uppercase">Location Manager</span>
                        <h2 className="text-3xl font-bold text-white">Select Location</h2>
                    </div>
                </div>

                {/* Form Content */}
                <div className="p-6 space-y-6">

                    {/* Search Address */}
                    <div className="space-y-3">
                        <label className="text-xs font-bold text-white/40 tracking-wider">SEARCH ADDRESS</label>
                        <div className="relative">
                            <Input
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                placeholder="Street name, area or landmark..."
                                className="h-[56px] pl-5 pr-12 bg-black/20 border-white/5 rounded-2xl text-white placeholder:text-white/20 focus-visible:ring-blue-500/50"
                            />
                            <Map className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
                        </div>
                    </div>

                    {/* Additional Details */}
                    <div className="space-y-3">
                        <label className="text-xs font-bold text-white/40 tracking-wider">ADDITIONAL DETAILS (OPTIONAL)</label>
                        <Input
                            value={apt}
                            onChange={(e) => setApt(e.target.value)}
                            placeholder="Apt, Suite, Floor, etc."
                            className="h-[56px] px-5 bg-black/20 border-white/5 rounded-2xl text-white placeholder:text-white/20 focus-visible:ring-blue-500/50"
                        />
                    </div>

                    {/* Save As */}
                    <div className="space-y-3">
                        <label className="text-xs font-bold text-white/40 tracking-wider">SAVE AS (OPTIONAL)</label>
                        <div className="flex flex-col gap-3">
                            <Input
                                value={customLabel}
                                onChange={(e) => setCustomLabel(e.target.value)}
                                placeholder="Label name"
                                className="h-[56px] px-5 bg-black/20 border-white/5 rounded-2xl text-white placeholder:text-white/20 focus-visible:ring-blue-500/50"
                            />
                            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                                {['Home', 'Office', 'Gym', 'Other'].map((l) => (
                                    <button
                                        key={l}
                                        onClick={() => setLabel(l)}
                                        className={`px-6 h-[40px] rounded-full text-sm font-medium border transition-all whitespace-nowrap ${label === l
                                                ? 'bg-blue-500 border-blue-500 text-white'
                                                : 'bg-transparent border-white/10 text-white/40 hover:bg-white/5'
                                            }`}
                                    >
                                        {l}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-6 pt-2 flex gap-4">
                    <Button
                        onClick={onClose}
                        variant="ghost"
                        className="flex-1 h-[56px] rounded-full border border-white/10 text-white hover:bg-white/5 hover:text-white"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSave}
                        className="flex-1 h-[56px] rounded-full bg-blue-500 hover:bg-blue-600 text-white font-bold gap-2 shadow-[0px_4px_20px_rgba(0,122,255,0.4)]"
                    >
                        <CheckCircle className="w-5 h-5" />
                        Save & Use
                    </Button>
                </div>

            </div>
        </div>
    );
}
