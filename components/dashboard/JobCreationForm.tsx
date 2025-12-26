
import { useState, useEffect, useRef } from 'react';
import { ServiceCategory, PRICE_MATRIX } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { MapPin } from 'lucide-react';
import useSWR from 'swr';

interface JobCreationFormProps {
    onSubmit: (details: { description: string; location: string; isASAP: boolean; scheduledAt?: Date }) => void;
    onCancel: () => void;
    loading: boolean;
    defaultLocation?: string;
}

export function JobCreationForm({ onSubmit, onCancel, loading, defaultLocation = '' }: JobCreationFormProps) {
    const category: ServiceCategory = 'HANDYMAN';
    const [description, setDescription] = useState('');
    const [location, setLocation] = useState(defaultLocation);
    const [isASAP, setIsASAP] = useState(true);
    const [scheduledTime, setScheduledTime] = useState('');
    const [debouncedDesc, setDebouncedDesc] = useState('');

    // Autocomplete State
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setLocation(defaultLocation);
    }, [defaultLocation]);

    useEffect(() => {
        const timer = setTimeout(async () => {
            if (location.length > 2 && showSuggestions) {
                try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&addressdetails=1&limit=5`);
                    if (res.ok) {
                        const data = await res.json();
                        setSuggestions(data);
                    }
                } catch (e) {
                    console.error("Autocomplete failed", e);
                }
            } else {
                setSuggestions([]);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [location, showSuggestions]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [wrapperRef]);

    const handleLocationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setLocation(e.target.value);
        setShowSuggestions(true);
    };

    const selectSuggestion = (address: string) => {
        setLocation(address);
        setShowSuggestions(false);
        setSuggestions([]);
    };

    useEffect(() => {
        const t = setTimeout(() => setDebouncedDesc(description), 400);
        return () => clearTimeout(t);
    }, [description]);

    const fetcher = async () => {
        if (!debouncedDesc) return null;
        const res = await fetch('/api/pricing/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category, description: debouncedDesc }),
        });
        if (!res.ok) return null;
        return res.json();
    };

    const { data: pricePreview, isLoading: priceLoading } = useSWR(
        debouncedDesc ? ['price-preview', debouncedDesc, category] : null,
        fetcher,
        { refreshInterval: 0 }
    );

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (showSuggestions && suggestions.length > 0) {
            // allow free text; no-op
        }

        onSubmit({
            description,
            location,
            isASAP,
            scheduledAt: isASAP ? undefined : new Date(scheduledTime)
        });
    };

    const basePrice = PRICE_MATRIX[category];
    const displayedPrice = pricePreview?.totalPrice ?? basePrice;

    return (
        <Card className="w-full max-w-lg mx-auto">
            <CardHeader>
                <CardTitle className="flex justify-between items-center">
                    <span className="text-gray-900">Handyman request</span>
                    <span className="text-blue-600 font-bold">£{displayedPrice.toFixed(2)}</span>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2 relative" ref={wrapperRef}>
                        <Label>Location</Label>
                        <div className="relative">
                            <Input
                                value={location}
                                onChange={handleLocationChange}
                                onFocus={() => setShowSuggestions(true)}
                                placeholder="e.g. 123 Main St, London"
                                required
                                autoComplete="off"
                            />
                            {showSuggestions && suggestions.length > 0 && (
                                <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-auto">
                                    {suggestions.map((s, i) => (
                                        <div
                                            key={i}
                                            className="p-3 hover:bg-gray-100 cursor-pointer text-sm flex items-start gap-2"
                                            onClick={() => selectSuggestion(s.display_name)}
                                        >
                                            <MapPin className="w-4 h-4 mt-0.5 text-gray-500 shrink-0" />
                                            <span className="text-gray-900">{s.display_name}</span>
                                        </div>
                                    ))}
                                    <div className="p-2 border-t text-xs text-right text-gray-400">Powered by OpenStreetMap</div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>What needs doing?</Label>
                        <Input
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="e.g. Hang two shelves and fix a leaking tap"
                            required
                        />
                    </div>

                    <div className="space-y-3 rounded-xl border border-blue-100 bg-white/70 backdrop-blur-sm p-4 shadow-inner">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-slate-800">Live Price Breakdown</span>
                            <span className="text-xs text-slate-500">{priceLoading ? 'Calculating...' : 'Auto-updates'}</span>
                        </div>
                        {pricePreview?.items?.length ? (
                            <div className="space-y-2">
                                {pricePreview.items.map((item: any, idx: number) => (
                                    <div key={idx} className="flex justify-between text-sm text-slate-700">
                                        <span className="font-medium">{item.quantity}x {item.itemType}</span>
                                        <span>£{item.totalPrice.toFixed(2)}</span>
                                    </div>
                                ))}
                                <div className="flex justify-between border-t pt-2 font-semibold text-slate-900">
                                    <span>Total</span>
                                    <span>£{pricePreview.totalPrice.toFixed(2)}</span>
                                </div>
                                {pricePreview.needsReview && (
                                    <p className="text-xs text-amber-600">Flagged for admin review</p>
                                )}
                                {pricePreview.usedFallback && (
                                    <p className="text-xs text-slate-500">Using fallback pricing</p>
                                )}
                            </div>
                        ) : (
                            <p className="text-xs text-slate-500">Start typing a description to see pricing. Base from £{basePrice}</p>
                        )}
                    </div>

                    <div className="space-y-4 pt-4">
                        <Label>When?</Label>
                        <div className="flex gap-4">
                            <Button
                                type="button"
                                variant={isASAP ? 'default' : 'outline'}
                                onClick={() => setIsASAP(true)}
                                className="flex-1"
                            >
                                ASAP
                            </Button>
                            <Button
                                type="button"
                                variant={!isASAP ? 'default' : 'outline'}
                                onClick={() => setIsASAP(false)}
                                className="flex-1"
                            >
                                Schedule
                            </Button>
                        </div>

                        {!isASAP && (
                            <Input
                                type="datetime-local"
                                value={scheduledTime}
                                onChange={(e) => setScheduledTime(e.target.value)}
                                required={!isASAP}
                            />
                        )}
                    </div>

                    <div className="flex gap-4 pt-4">
                        <Button type="button" variant="ghost" onClick={onCancel} disabled={loading}>
                            Cancel
                        </Button>
                        <Button type="submit" className="flex-1" disabled={loading}>
                            {loading ? 'Confirming...' : `Book for £${displayedPrice.toFixed(2)}`}
                        </Button>
                    </div>

                    <p className="text-xs text-center text-gray-500">
                        Price locks on booking. Admin overrides require a reason.
                    </p>
                </form>
            </CardContent>
        </Card>
    );
}
