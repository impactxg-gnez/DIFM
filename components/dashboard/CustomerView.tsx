'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { JobCreationForm } from './JobCreationForm';
import { DispatchTimer } from './DispatchTimer';
import { ProviderMap } from './ProviderMap';
import { Plus, MapPin } from 'lucide-react';
import { CustomerGreeting } from './CustomerGreeting';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function CustomerView({ user }: { user: any }) {
    const { data: jobs, mutate } = useSWR('/api/jobs', fetcher, { refreshInterval: 5000 });

    // Steps: LIST -> CREATE -> WAITING
    const [step, setStep] = useState<'LIST' | 'CREATE' | 'WAITING'>('LIST');
    const [activeJobId, setActiveJobId] = useState<string | null>(null);

    // Location Logic
    const [userLocation, setUserLocation] = useState<string>('');
    const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [isLocating, setIsLocating] = useState(false);

    useEffect(() => {
        // Auto-grab location on mount (page load)
        if (navigator.geolocation && !userLocation) {
            setIsLocating(true);
            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    const { latitude, longitude } = position.coords;
                    setUserCoords({ lat: latitude, lng: longitude });
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

    const handleCreateJob = async (details: any) => {
        try {
            const res = await fetch('/api/jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...details,
                    latitude: userCoords?.lat,
                    longitude: userCoords?.lng,
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
    if (step === 'CREATE') {
        return (
            <div className="space-y-4">
                <JobCreationForm
                    onSubmit={handleCreateJob}
                    onCancel={() => setStep('LIST')}
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

    const handleCreateSimulation = async () => {
        // Find customer's current location to spawn provider 15 mins (approx 7-8km) away
        let lat = userCoords?.lat || 51.5074;
        let lng = userCoords?.lng || -0.1278;

        try {
            const res = await fetch('/api/jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    description: "Simulation: Fix a leaking pipe",
                    location: userLocation || "London, UK",
                    latitude: lat,
                    longitude: lng,
                    category: 'PLUMBER',
                    isSimulation: true,
                    price: 0
                }),
            });
            if (res.ok) {
                const job = await res.json();
                setActiveJobId(job.id);
                setStep('WAITING');
                mutate();
            }
        } catch (e) {
            console.error("Sim creation failed", e);
        }
    };

    // Default: LIST
    return (
        <div className="space-y-8">
            <CustomerGreeting onSetLocation={(loc) => setUserLocation(loc)} />
            <div className="flex justify-between items-center gap-4">
                <h2 className="text-xl font-semibold text-gray-900">Your Jobs</h2>
                <div className="flex gap-2">
                    <Button onClick={handleCreateSimulation} variant="outline" className="border-dashed border-blue-400 text-blue-600 hover:bg-blue-50">
                        Spawn Test Job (15m delay)
                    </Button>
                    <Button onClick={() => setStep('CREATE')} className="gap-2">
                        <Plus className="w-4 h-4" /> New Request
                    </Button>
                </div>
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
                                        <h3 className="font-bold text-lg text-gray-900">{job.category}</h3>
                                        <p className="font-medium text-gray-800">{job.description}</p>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-bold text-lg text-gray-900">£{job.fixedPrice}</div>
                                        <div className="text-sm text-gray-500">{job.isASAP ? 'ASAP' : new Date(job.scheduledAt).toLocaleString()}</div>
                                    </div>
                                </div>
                                <div className="mt-4 pt-4 border-t flex justify-between text-sm text-gray-500">
                                    <span>{job.location}</span>
                                    {job.provider && <span className="text-blue-600 font-medium">Pro: {job.provider.name}</span>}
                                </div>
                                {['ACCEPTED', 'IN_PROGRESS'].includes(job.status) && job.provider?.latitude && job.latitude && (
                                    <div className="mt-4">
                                        <ProviderMap
                                            providerLat={job.provider.latitude}
                                            providerLon={job.provider.longitude}
                                            jobLat={job.latitude}
                                            jobLon={job.longitude}
                                        />
                                    </div>
                                )}
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
