'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ServiceSelection } from './ServiceSelection';
import { JobCreationForm } from './JobCreationForm';
import { DispatchTimer } from './DispatchTimer';
import { ServiceCategory } from '@/lib/constants';
import { Plus, MapPin } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function CustomerView({ user }: { user: any }) {
    const { data: jobs, mutate } = useSWR('/api/jobs', fetcher, { refreshInterval: 5000 });

    // Steps: LIST -> SELECT -> CREATE -> WAITING
    const [step, setStep] = useState<'LIST' | 'SELECT' | 'CREATE' | 'WAITING'>('LIST');
    const [selectedCategory, setSelectedCategory] = useState<ServiceCategory | null>(null);
    const [activeJobId, setActiveJobId] = useState<string | null>(null);

    // Location Logic
    const [userLocation, setUserLocation] = useState<string>('');
    const [isLocating, setIsLocating] = useState(false);

    useEffect(() => {
        // Auto-grab location on mount (page load)
        if (navigator.geolocation && !userLocation) {
            setIsLocating(true);
            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    const { latitude, longitude } = position.coords;
                    try {
                        // Free reverse geocoding via OpenStreetMap (Nominatim)
                        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
                        if (res.ok) {
                            const data = await res.json();
                            // Construct simple address
                            const address = data.display_name.split(',').slice(0, 3).join(', ');
                            setUserLocation(address);
                        }
                    } catch (e) {
                        console.error("Geocoding failed", e);
                        setUserLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
                    } finally {
                        setIsLocating(false);
                    }
                },
                (error) => {
                    console.error("Location permission denied or failed", error);
                    setIsLocating(false);
                }
            );
        }
    }, []);

    const handleCategorySelect = (category: ServiceCategory) => {
        setSelectedCategory(category);
        setStep('CREATE');
    };

    const handleCreateJob = async (details: any) => {
        try {
            const res = await fetch('/api/jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...details,
                    category: selectedCategory,
                    price: 0 // Backend fills from Matrix, passing 0 placeholder
                }),
            });
            if (res.ok) {
                const job = await res.json();
                setActiveJobId(job.id);
                setStep('WAITING');
                mutate();
            }
        } catch (e) {
            console.error("Job creation failed", e);
        }
    };

    const handleCancelJob = async () => {
        if (!activeJobId) return;
        await fetch(`/api/jobs/${activeJobId}/cancel`, { method: 'POST' });
        setStep('LIST');
        mutate();
    };

    // Render Logic
    if (step === 'SELECT') {
        return (
            <div className="space-y-4">
                <Button variant="ghost" onClick={() => setStep('LIST')} className="mb-4">← Back to Dashboard</Button>
                <h1 className="text-2xl font-bold mb-6">Select a Service</h1>
                <ServiceSelection onSelect={handleCategorySelect} />
            </div>
        );
    }

    if (step === 'CREATE' && selectedCategory) {
        return (
            <div className="space-y-4">
                <JobCreationForm
                    category={selectedCategory}
                    onSubmit={handleCreateJob}
                    onBack={() => setStep('SELECT')}
                    loading={false}
                    defaultLocation={userLocation}
                />
            </div>
        );
    }

    if (step === 'WAITING' && activeJobId) {
        return (
            <DispatchTimer
                jobId={activeJobId}
                onCompleted={() => setStep('LIST')}
                onCancel={handleCancelJob}
            />
        );
    }

    // Default: LIST
    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Your Jobs</h2>
                <Button onClick={() => setStep('SELECT')} className="gap-2">
                    <Plus className="w-4 h-4" /> New Request
                </Button>
            </div>

            {!jobs ? <p>Loading...</p> : jobs.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed text-gray-400">
                    No active jobs. Start a new request!
                </div>
            ) : (
                <div className="grid gap-4">
                    {jobs.map((job: any) => (
                        <Card key={job.id} className="overflow-hidden">
                            <div className="p-6">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="space-y-1">
                                        <Badge variant={
                                            ['COMPLETED', 'CLOSED'].includes(job.status) ? 'default' :
                                                ['CANCELLED_FREE', 'CANCELLED_CHARGED'].includes(job.status) ? 'destructive' : 'secondary'
                                        } className="mb-2">
                                            {job.status.replace('_', ' ')}
                                        </Badge>
                                        <h3 className="font-bold text-lg">{job.category}</h3>
                                        <p className="font-medium text-gray-800">{job.description}</p>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-bold text-lg">£{job.fixedPrice}</div>
                                        <div className="text-sm text-gray-500">{job.isASAP ? 'ASAP' : new Date(job.scheduledAt).toLocaleString()}</div>
                                    </div>
                                </div>
                                <div className="mt-4 pt-4 border-t flex justify-between text-sm text-gray-500">
                                    <span>{job.location}</span>
                                    {job.provider && <span className="text-blue-600 font-medium">Pro: {job.provider.name}</span>}
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
