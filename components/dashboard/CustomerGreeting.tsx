'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MapPin, Sparkles } from 'lucide-react';

export function CustomerGreeting({ onSetLocation }: { onSetLocation: (loc: string) => void }) {
    const [preferredLocation, setPreferredLocation] = useState('');

    useEffect(() => {
        const saved = localStorage.getItem('preferredLocation');
        if (saved) {
            setPreferredLocation(saved);
            onSetLocation(saved);
        }
    }, [onSetLocation]);

    const handleSave = () => {
        if (!preferredLocation) return;
        localStorage.setItem('preferredLocation', preferredLocation);
        onSetLocation(preferredLocation);
    };

    return (
        <Card className="p-4 bg-white/70 backdrop-blur border border-slate-200 mb-4">
            <div className="flex items-start gap-3">
                <div className="p-2 rounded-full bg-indigo-50 border border-indigo-100">
                    <Sparkles className="w-4 h-4 text-indigo-500" />
                </div>
                <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-slate-600" />
                        <p className="text-sm font-semibold text-slate-800">Welcome back! Set your preferred location.</p>
                    </div>
                    <div className="flex gap-2">
                        <Input
                            placeholder="e.g. 221B Baker Street, London"
                            value={preferredLocation}
                            onChange={(e) => setPreferredLocation(e.target.value)}
                        />
                        <Button onClick={handleSave} variant="default">Save</Button>
                    </div>
                    <p className="text-xs text-slate-500">We’ll prefill new bookings with this address.</p>
                </div>
            </div>
        </Card>
    );
}

