
import { useState, useEffect, useRef } from 'react';
import { ServiceCategory, SERVICE_CATEGORIES, PRICE_MATRIX } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { MapPin } from 'lucide-react';

interface JobCreationFormProps {
    category: ServiceCategory;
    onSubmit: (details: { description: string; location: string; isASAP: boolean; scheduledAt?: Date }) => void;
    onBack: () => void;
    loading: boolean;
    defaultLocation?: string;
}

export function JobCreationForm({ category, onSubmit, onBack, loading, defaultLocation = '' }: JobCreationFormProps) {
    const [description, setDescription] = useState('');
    const [location, setLocation] = useState(defaultLocation);
    const [isASAP, setIsASAP] = useState(true);
    const [scheduledTime, setScheduledTime] = useState('');

    // Autocomplete State
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setLocation(defaultLocation);
    }, [defaultLocation]);

    useEffect(() => {
        // Debounced Search
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

    // Close suggestions on click outside
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

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // Prevent submit on enter key if suggestion list is open? 
        // Or just let it submit current value? Let's check.
        if (showSuggestions && suggestions.length > 0) {
            // Optional: Force selection? No, let user type free text too.
        }

        onSubmit({
            description,
            location,
            isASAP,
            scheduledAt: isASAP ? undefined : new Date(scheduledTime)
        });
    };

    const price = PRICE_MATRIX[category];

    return (
        <Card className="w-full max-w-lg mx-auto">
            <CardHeader>
                <CardTitle className="flex justify-between items-center">
                    <span>{SERVICE_CATEGORIES[category]} Service</span>
                    <span className="text-blue-600 font-bold">£{price}</span>
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
                                autoComplete="off" // Disable browser autocomplete
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
                                            <span>{s.display_name}</span>
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
                            placeholder="Describe the issue..."
                            required
                        />
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
                        <Button type="button" variant="ghost" onClick={onBack} disabled={loading}>
                            Back
                        </Button>
                        <Button type="submit" className="flex-1" disabled={loading}>
                            {loading ? 'Confirming...' : `Book for £${price}`}
                        </Button>
                    </div>

                    <p className="text-xs text-center text-gray-500">
                        Price is fixed. Payment due after completion.
                    </p>
                </form>
            </CardContent>
        </Card>
    );
}
