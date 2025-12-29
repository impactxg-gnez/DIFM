/**
 * Phase 2: Job creation form with intelligent pricing
 * Single text input with parts question
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import useSWR from 'swr';

interface JobCreationFormProps {
    onSubmit: (details: { description: string; location: string; partsExpectedAtBooking?: string }) => void;
    onCancel: () => void;
    loading: boolean;
    defaultLocation?: string;
}

export function JobCreationForm({ onSubmit, onCancel, loading, defaultLocation = '' }: JobCreationFormProps) {
    const [description, setDescription] = useState('');
    const [location, setLocation] = useState(defaultLocation);
    const [debouncedDesc, setDebouncedDesc] = useState('');
    const [partsExpected, setPartsExpected] = useState<string>('');

    useEffect(() => {
        setLocation(defaultLocation);
    }, [defaultLocation]);

    // Debounce description for price preview
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedDesc(description), 400);
        return () => clearTimeout(timer);
    }, [description]);

    // Fetch price preview from API
    const fetcher = async () => {
        if (!debouncedDesc.trim()) return null;
        const res = await fetch('/api/pricing/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: 'HANDYMAN', description: debouncedDesc }),
        });
        if (!res.ok) return null;
        return res.json();
    };

    const { data: pricePreview, isLoading: priceLoading } = useSWR(
        debouncedDesc ? ['price-preview', debouncedDesc] : null,
        fetcher,
        { refreshInterval: 0 }
    );

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!description.trim() || !location.trim()) {
            alert('Please enter both description and location');
            return;
        }
        onSubmit({ description, location, partsExpectedAtBooking: partsExpected || undefined });
    };

    const displayedPrice = pricePreview?.totalPrice ?? 0;

    return (
        <Card className="w-full max-w-lg mx-auto">
            <CardHeader>
                <CardTitle className="flex justify-between items-center">
                    <span className="text-gray-900">New Job Request</span>
                    {displayedPrice > 0 && (
                        <span className="text-blue-600 font-bold">£{displayedPrice.toFixed(2)}</span>
                    )}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                        <Label>What needs doing?</Label>
                        <Input
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="e.g. Fix leaking tap, Hang two shelves and install a fan"
                            required
                            className="text-base"
                        />
                        <p className="text-xs text-gray-500">
                            Describe your request in plain English
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label>Location</Label>
                        <Input
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            placeholder="e.g. 123 Main St, London"
                            required
                        />
                    </div>

                    {pricePreview && pricePreview.items && pricePreview.items.length > 0 && (
                        <div className="space-y-3 rounded-xl border border-blue-100 bg-white/70 backdrop-blur-sm p-4 shadow-inner">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-slate-800">Price Breakdown</span>
                                <span className="text-xs text-slate-500">{priceLoading ? 'Calculating...' : 'Auto-updates'}</span>
                            </div>
                            <div className="space-y-2">
                                {pricePreview.items.map((item: any, idx: number) => (
                                    <div key={idx} className="flex justify-between text-sm text-slate-700">
                                        <span className="font-medium">
                                            {item.quantity > 1 ? `${item.quantity}x ` : ''}
                                            {item.description || item.itemType}
                                        </span>
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
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label>Parts & Materials (Optional)</Label>
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                variant={partsExpected === 'YES' ? 'default' : 'outline'}
                                onClick={() => setPartsExpected('YES')}
                                className="flex-1"
                            >
                                Yes
                            </Button>
                            <Button
                                type="button"
                                variant={partsExpected === 'NO' ? 'default' : 'outline'}
                                onClick={() => setPartsExpected('NO')}
                                className="flex-1"
                            >
                                No
                            </Button>
                            <Button
                                type="button"
                                variant={partsExpected === 'NOT_SURE' ? 'default' : 'outline'}
                                onClick={() => setPartsExpected('NOT_SURE')}
                                className="flex-1"
                            >
                                Not sure
                            </Button>
                        </div>
                        <p className="text-xs text-gray-500">Do you think parts or materials may be required? (Pricing assumes labour only)</p>
                    </div>

                    <div className="flex gap-4 pt-4">
                        <Button type="button" variant="ghost" onClick={onCancel} disabled={loading}>
                            Cancel
                        </Button>
                        <Button type="submit" className="flex-1" disabled={loading || displayedPrice === 0}>
                            {loading ? 'Creating...' : `Create Job - £${displayedPrice.toFixed(2)}`}
                        </Button>
                    </div>

                    <p className="text-xs text-center text-gray-500">
                        Price will be locked when you confirm the job
                    </p>
                </form>
            </CardContent>
        </Card>
    );
}
