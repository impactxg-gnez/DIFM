'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, Map, CheckCircle, MapPin, Plus, Trash2, Edit2, Home, Briefcase, MapIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface AddressModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (address: string, label?: string) => void;
}

export function AddressModal({ isOpen, onClose, onSave }: AddressModalProps) {
    const [view, setView] = useState<'list' | 'form'>('list');
    
    // List state
    const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Form state
    const [editingId, setEditingId] = useState<string | null>(null);
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

    const fetchAddresses = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/user/addresses');
            if (res.ok) {
                const data = await res.json();
                setSavedAddresses(data);
                if (data.length === 0) setView('form');
                else setView('list');
            } else {
                setView('form');
            }
        } catch (e) {
            setView('form');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchAddresses();
            resetForm();
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const resetForm = () => {
        setEditingId(null);
        setAddress('');
        setApt('');
        setLabel('Home');
        setCustomLabel('');
    };

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

    const handleSaveForm = async () => {
        if (!address.trim()) return;
        const fullAddress = `${address}${apt ? `, ${apt}` : ''}`;
        const finalLabel = label === 'Other' ? (customLabel || 'Other') : label;
        
        try {
            let res;
            if (editingId) {
                res = await fetch(`/api/user/addresses/${editingId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ address, apt, label: finalLabel })
                });
            } else {
                res = await fetch('/api/user/addresses', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ address, apt, label: finalLabel })
                });
            }

            if (res.ok) {
                onSave(fullAddress, finalLabel);
                onClose();
            } else {
                onSave(fullAddress, finalLabel);
                onClose();
            }
        } catch (e) {
            onSave(fullAddress, finalLabel);
            onClose();
        }
    };

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await fetch(`/api/user/addresses/${id}`, { method: 'DELETE' });
            fetchAddresses();
        } catch (err) {
            console.error(err);
        }
    };

    const handleEdit = (addr: any, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingId(addr.id);
        setAddress(addr.address);
        setApt(addr.apt || '');
        if (['Home', 'Office'].includes(addr.label)) {
            setLabel(addr.label);
        } else {
            setLabel('Other');
            setCustomLabel(addr.label);
        }
        setView('form');
    };

    const handleSelectAddress = (addr: any) => {
        const fullAddress = `${addr.address}${addr.apt ? `, ${addr.apt}` : ''}`;
        onSave(fullAddress, addr.label);
        onClose();
    };

    const labels = ['Home', 'Office', 'Other'];

    const getIcon = (lbl: string) => {
        if (lbl === 'Home') return <Home className="w-5 h-5" />;
        if (lbl === 'Office') return <Briefcase className="w-5 h-5" />;
        return <MapIcon className="w-5 h-5" />;
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-[#1E1E20] border border-white/10 rounded-[32px] overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-6 pb-2 shrink-0">
                    <div className="flex items-center justify-between mb-6">
                        <button onClick={() => {
                            if (view === 'form' && savedAddresses.length > 0) {
                                setView('list');
                            } else {
                                onClose();
                            }
                        }} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
                            <ChevronLeft className="w-6 h-6 text-white" />
                        </button>
                        {view === 'list' && (
                            <button onClick={() => { resetForm(); setView('form'); }} className="flex items-center gap-1 text-blue-500 text-sm font-semibold hover:text-blue-400">
                                <Plus className="w-4 h-4" /> Add New
                            </button>
                        )}
                    </div>
                    <div className="space-y-1">
                        <span className="text-blue-500 text-xs font-bold tracking-widest uppercase">Location Manager</span>
                        <h2 className="text-3xl font-bold text-white">
                            {view === 'list' ? 'Saved Locations' : (editingId ? 'Edit Location' : 'Add Location')}
                        </h2>
                    </div>
                </div>

                {/* Scrollable Content */}
                <div className="p-6 space-y-6 overflow-y-auto">
                    {view === 'list' ? (
                        <div className="space-y-3">
                            {isLoading ? (
                                <p className="text-white/40 text-sm">Loading addresses...</p>
                            ) : savedAddresses.length === 0 ? (
                                <p className="text-white/40 text-sm">No saved locations found.</p>
                            ) : (
                                savedAddresses.map((addr) => (
                                    <div 
                                        key={addr.id} 
                                        onClick={() => handleSelectAddress(addr)}
                                        className="p-4 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-4 cursor-pointer hover:bg-white/10 transition-colors"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center shrink-0">
                                            {getIcon(addr.label)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-white font-semibold text-sm truncate">{addr.label}</p>
                                            <p className="text-white/60 text-xs truncate">{addr.address}{addr.apt ? `, ${addr.apt}` : ''}</p>
                                        </div>
                                        <div className="flex gap-2 shrink-0">
                                            <button onClick={(e) => handleEdit(addr, e)} className="p-2 text-white/40 hover:text-white transition-colors">
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button onClick={(e) => handleDelete(addr.id, e)} className="p-2 text-red-400/60 hover:text-red-400 transition-colors">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    ) : (
                        <>
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
                        </>
                    )}
                </div>

                {/* Footer Actions */}
                {view === 'form' && (
                    <div className="p-6 pt-2 flex gap-4 shrink-0 mt-auto">
                        <Button
                            onClick={() => savedAddresses.length > 0 ? setView('list') : onClose()}
                            variant="ghost"
                            className="flex-1 h-[56px] rounded-full border border-white/10 text-white hover:bg-white/5 hover:text-white"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSaveForm}
                            disabled={!address.trim()}
                            className="flex-1 h-[56px] rounded-full bg-blue-500 hover:bg-blue-600 text-white font-bold gap-2 shadow-[0px_4px_20px_rgba(0,122,255,0.4)] disabled:opacity-50"
                        >
                            <CheckCircle className="w-5 h-5" />
                            {editingId ? 'Update & Use' : 'Save & Use'}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}

