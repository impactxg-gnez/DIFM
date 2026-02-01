'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, Map, CheckCircle, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface AddressModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (address: string, label?: string) => void;
}

export function AddressModal({ isOpen, onClose, onSave }: AddressModalProps) {
    const [address, setAddress] = useState('');
    const [apt, setApt] = useState('');
    const [label, setLabel] = useState('Home');
    const [customLabel, setCustomLabel] = useState('');

    // Autocomplete State
    const [predictions, setPredictions] = useState<any[]>([]);
    const [showPredictions, setShowPredictions] = useState(false);
    const autocompleteService = useRef<any>(null);

    // Initialize Service
    useEffect(() => {
        if (isOpen && window.google && !autocompleteService.current) {
            autocompleteService.current = new window.google.maps.places.AutocompleteService();
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setAddress(value);

        if (!value.trim() || !autocompleteService.current) {
            setPredictions([]);
            setShowPredictions(false);
            return;
        }

        autocompleteService.current.getPlacePredictions(
            { input: value },
            (results: any[], status: any) => {
                if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
                    setPredictions(results);
                    setShowPredictions(true);
                } else {
                    setPredictions([]);
                    setShowPredictions(false);
                }
            }
        );
    };

    const handlePredictionSelect = (prediction: any) => {
        setAddress(prediction.description);
        setPredictions([]);
        setShowPredictions(false);
    };

    const handleSave = () => {
        if (!address.trim()) return;
        const fullAddress = `${address}${apt ? `, ${apt}` : ''}`;
        const finalLabel = label === 'Other' ? (customLabel || 'Other') : label;
        onSave(fullAddress, finalLabel);
        onClose();
    };

    const labels = ['Home', 'Office', 'Other'];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-[#1E1E20] border border-white/10 rounded-[32px] overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-6 pb-2 shrink-0">
                    <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors mb-6">
                        <ChevronLeft className="w-6 h-6 text-white" />
                    </button>
                    <div className="space-y-1">
                        <span className="text-blue-500 text-xs font-bold tracking-widest uppercase">Location Manager</span>
                        <h2 className="text-3xl font-bold text-white">Select Location</h2>
                    </div>
                </div>

                {/* Scrollable Content */}
                <div className="p-6 space-y-6 overflow-y-auto">

                    {/* Search Address */}
                    <div className="space-y-3 relative">
                        <label className="text-xs font-bold text-white/40 tracking-wider">SEARCH ADDRESS</label>
                        <div className="relative">
                            <Input
                                value={address}
                                onChange={handleInputChange}
                                placeholder="Street name, area or landmark..."
                                className="h-[56px] pl-5 pr-12 bg-black/20 border-white/5 rounded-2xl text-white placeholder:text-white/20 focus-visible:ring-blue-500/50"
                            />
                            <Map className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
                        </div>

                        {/* Predictions Dropdown */}
                        {showPredictions && predictions.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-[#1E1E20] border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden max-h-[200px] overflow-y-auto">
                                {predictions.map((prediction) => (
                                    <div
                                        key={prediction.place_id}
                                        onClick={() => handlePredictionSelect(prediction)}
                                        className="p-4 hover:bg-white/5 cursor-pointer flex items-center gap-3 transition-colors border-b border-white/5 last:border-0"
                                    >
                                        <MapPin className="w-4 h-4 text-white/40 shrink-0" />
                                        <span className="text-sm text-white/80 line-clamp-1">{prediction.description}</span>
                                    </div>
                                ))}
                            </div>
                        )}
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
                            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                                {labels.map((l) => (
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

                            {/* Custom Label Input - Only if Other is selected */}
                            {label === 'Other' && (
                                <Input
                                    value={customLabel}
                                    onChange={(e) => setCustomLabel(e.target.value)}
                                    placeholder="Name this location (e.g. My Studio)"
                                    className="h-[56px] px-5 bg-black/20 border-white/5 rounded-2xl text-white placeholder:text-white/20 focus-visible:ring-blue-500/50 animate-in fade-in slide-in-from-top-2"
                                    autoFocus
                                />
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-6 pt-2 flex gap-4 shrink-0 mt-auto">
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
