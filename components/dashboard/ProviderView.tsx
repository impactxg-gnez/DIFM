'use client';

import { useEffect } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Badge as StatusBadge } from '@/components/ui/badge';
import { ProviderMap } from './ProviderMap';
import { MapPin } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function ProviderView({ user }: { user: any }) {
    // API automatically filters for provider's category and dispatch radius
    const { data: jobs, mutate } = useSWR('/api/jobs', fetcher, { refreshInterval: 2000 });

    useEffect(() => {
        // Request location permission on mount for Providers too
        if (navigator.geolocation) {
            // Heartbeat location update
            const updateLocation = async () => {
                // Simulation Logic: If this is the simulator account, move towards the job
                if (user.email === 'simulator@demo.com') {
                    // Find active job
                    const activeJob = jobs?.find((j: any) => ['ACCEPTED', 'IN_PROGRESS'].includes(j.status));
                    if (activeJob && activeJob.latitude && activeJob.longitude) {
                        const currentLat = user.latitude || 51.5874;
                        const currentLng = user.longitude || -0.0478;

                        // Move 20% closer every update
                        const newLat = currentLat + (activeJob.latitude - currentLat) * 0.2;
                        const newLng = currentLng + (activeJob.longitude - currentLng) * 0.2;

                        try {
                            await fetch('/api/user/location', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ latitude: newLat, longitude: newLng })
                            });
                        } catch (e) { }
                        return; // Skip normal geolocation update
                    }
                }

                navigator.geolocation.getCurrentPosition(
                    async (position) => {
                        const { latitude, longitude } = position.coords;
                        try {
                            await fetch('/api/user/location', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ latitude, longitude })
                            });
                        } catch (e) {
                            console.error("Failed to heart-beat location", e);
                        }
                    },
                    (error) => console.error("Location error", error),
                    { enableHighAccuracy: true }
                );
            };

            // Run immediately on mount
            updateLocation();
            
            // Then run every 10s
            const interval = setInterval(updateLocation, 10000);
            return () => clearInterval(interval);
        }
    }, [user, jobs]);

    const acceptJob = async (jobId: string) => {
        try {
            const res = await fetch(`/api/jobs/${jobId}/accept`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ providerId: user.id })
            });
            if (res.ok) {
                mutate();
            } else {
                alert("Failed to accept job. It might have been taken.");
                mutate();
            }
        } catch (e) {
            console.error(e);
        }
    };

    const updateStatus = async (jobId: string, status: string) => {
        await fetch(`/api/jobs/${jobId}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        mutate();
    };

    if (!jobs) return <div>Loading jobs...</div>;

    const availableJobs = jobs.filter((j: any) => j.status === 'DISPATCHED');
    const myJobs = jobs.filter((j: any) => j.providerId === user.id);

    return (
        <div className="grid md:grid-cols-2 gap-8">
            {/* Available Jobs Column */}
            <div className="space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2 text-gray-900">
                    Available Jobs
                    <span className="text-xs bg-gray-200 px-2 py-1 rounded-full text-gray-900">{availableJobs.length}</span>
                </h2>
                {availableJobs.map((job: any) => (
                    <Card key={job.id} className="p-4 border-l-4 border-l-yellow-400">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="font-semibold text-gray-900">{job.category} - {job.description}</h3>
                                <p className="text-sm text-gray-500">{job.location}</p>
                                <div className="mt-2 text-lg font-bold text-blue-600">£{job.fixedPrice}</div>
                                <p className="text-xs text-gray-400 mt-1">{job.isASAP ? 'ASAP' : new Date(job.scheduledAt).toLocaleString()}</p>
                            </div>
                        </div>
                        <Button onClick={() => acceptJob(job.id)} className="w-full">Accept Job</Button>
                    </Card>
                ))}
                {availableJobs.length === 0 && <p className="text-gray-500 text-sm">No new jobs matching your skills nearby.</p>}
            </div>

            {/* My Active Jobs Column */}
            <div className="space-y-4">
                <h2 className="text-xl font-semibold text-gray-900">My Schedule</h2>
                {myJobs.map((job: any) => (
                    <Card key={job.id} className="p-4">
                        <div className="flex justify-between items-center mb-2">
                            <Badge status={job.status}>{job.status.replace('_', ' ')}</Badge>
                            <span className="text-sm font-mono font-bold text-gray-900">£{job.fixedPrice}</span>
                        </div>
                        <h3 className="font-semibold mb-1 text-gray-900">{job.description}</h3>
                        <p className="text-sm text-gray-500 mb-4 flex items-start gap-1">
                            <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                            {job.location}
                        </p>

                        {['ACCEPTED', 'IN_PROGRESS'].includes(job.status) && job.latitude && (
                            <div className="mb-4">
                                <ProviderMap
                                    providerLat={user.latitude || 51.5074} // Fallback to London 
                                    providerLon={user.longitude || -0.1278}
                                    jobLat={job.latitude}
                                    jobLon={job.longitude}
                                    showRoute={true}
                                />
                            </div>
                        )}

                        <div className="flex gap-2">
                            {job.status === 'ACCEPTED' && (
                                <Button onClick={() => updateStatus(job.id, 'IN_PROGRESS')} className="w-full" variant="outline">Start Job</Button>
                            )}
                            {job.status === 'IN_PROGRESS' && (
                                <Button onClick={() => updateStatus(job.id, 'COMPLETED')} className="w-full bg-green-600 hover:bg-green-700">Complete Job</Button>
                            )}
                            {['COMPLETED', 'CLOSED'].includes(job.status) && (
                                <div className="w-full text-center text-sm text-green-600 font-medium py-2">Job Done / Closed</div>
                            )}
                            {['CANCELLED_FREE', 'CANCELLED_CHARGED'].includes(job.status) && (
                                <div className="w-full text-center text-sm text-red-600 font-medium py-2">Cancelled</div>
                            )}
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );
}
