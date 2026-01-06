'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Badge as StatusBadge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProviderMap } from './ProviderMap';
import { UserLocationMap } from './UserLocationMap';
import { MapPin } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

import { ProviderOnboarding } from '../provider/ProviderOnboarding';

export function ProviderView({ user }: { user: any }) {
    // Enable onboarding if provider hasn't set up capabilities or compliance
    const [showOnboarding, setShowOnboarding] = useState(!user.capabilities || !user.complianceConfirmed);

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

    const [completionDialog, setCompletionDialog] = useState<{ open: boolean; jobId?: string }>({ open: false });
    const [completionNotes, setCompletionNotes] = useState('');
    const [completionPhotos, setCompletionPhotos] = useState('');
    const [partsRequired, setPartsRequired] = useState<string>('');
    const [partsNotes, setPartsNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const updateStatus = async (jobId: string, status: string) => {
        if (status === 'COMPLETED') {
            setCompletionDialog({ open: true, jobId });
            return;
        }
        await fetch(`/api/jobs/${jobId}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        mutate();
    };

    const submitCompletion = async () => {
        if (!completionDialog.jobId) return;
        if (!completionNotes.trim()) {
            alert('Completion notes are required');
            return;
        }

        // Find the job to check if it's a cleaning job
        const job = jobs?.find((j: any) => j.id === completionDialog.jobId);
        const isCleaningJob = job?.category === 'CLEANING';

        // For cleaning jobs, parts are always N/A
        // For other jobs, require parts confirmation
        if (!isCleaningJob) {
            if (!partsRequired || !['YES', 'NO', 'N/A'].includes(partsRequired)) {
                alert('Please confirm if parts were required');
                return;
            }
            if (partsRequired === 'YES' && !partsNotes.trim()) {
                alert('Please add notes about the parts used');
                return;
            }
        }

        setIsSubmitting(true);
        try {
            await fetch(`/api/jobs/${completionDialog.jobId}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'COMPLETED',
                    completionNotes,
                    completionPhotos: completionPhotos || null,
                    // For cleaning jobs, always send N/A for parts
                    partsRequiredAtCompletion: isCleaningJob ? 'N/A' : partsRequired,
                    partsNotes: isCleaningJob ? null : (partsRequired === 'YES' ? partsNotes : null),
                })
            });
            setCompletionDialog({ open: false });
            setCompletionNotes('');
            setCompletionPhotos('');
            setPartsRequired('');
            setPartsNotes('');
            mutate();
        } catch (e) {
            console.error('Completion error', e);
            alert('Failed to complete job');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Show onboarding if needed
    if (showOnboarding) {
        return (
            <ProviderOnboarding
                user={user}
                onComplete={() => {
                    setShowOnboarding(false);
                    window.location.reload(); // Refresh to get updated user data
                }}
            />
        );
    }

    // Check if provider is active
    if (user.providerStatus !== 'ACTIVE') {
        return (
            <div className="space-y-4">
                {/* Location Tracker for Pending Providers too */}
                <div className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm flex flex-col md:flex-row gap-4 items-start md:items-center">
                    <div className="flex-1 space-y-1">
                        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-blue-500" />
                            Location Services Active
                        </h3>
                        <p className="text-sm text-gray-500">
                            We are tracking your location to match you with nearby jobs.
                        </p>
                        <p className="text-xs text-mono text-gray-400">
                            {user.latitude?.toFixed(4)}, {user.longitude?.toFixed(4)}
                        </p>
                    </div>
                    <div className="w-full md:w-[250px] shrink-0">
                        {(user.latitude && user.longitude) ? (
                            <UserLocationMap latitude={user.latitude} longitude={user.longitude} />
                        ) : (
                            <div className="h-[150px] bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-sm">
                                Waiting for location...
                            </div>
                        )}
                    </div>
                </div>

                <Card className="p-6">
                    <h2 className="text-xl font-bold mb-2">Account Status: {user.providerStatus || 'PENDING'}</h2>
                    <p className="text-gray-600">
                        Your provider account is pending admin approval. You will be able to receive jobs once approved.
                    </p>
                    <p className="text-sm text-gray-500 mt-2">
                        Your profile has been pre-configured. Please wait for admin approval.
                    </p>
                </Card>
            </div>
        );
    }

    if (!jobs) return <div>Loading jobs...</div>;

    const availableJobs = jobs.filter((j: any) => j.status === 'DISPATCHED');
    const myJobs = jobs.filter((j: any) => j.providerId === user.id);

    return (
        <div className="grid md:grid-cols-2 gap-8">
            {/* Available Jobs Column */}
            <div className="space-y-4">
                {/* Location Tracker */}
                <div className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm mb-6">
                    <div className="flex justify-between items-start mb-4">
                        <div className="space-y-1">
                            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-blue-500" />
                                My Location
                            </h3>
                            <p className="text-xs text-mono text-gray-400">
                                {user.latitude?.toFixed(4)}, {user.longitude?.toFixed(4)}
                            </p>
                        </div>
                    </div>
                    {(user.latitude && user.longitude) ? (
                        <UserLocationMap latitude={user.latitude} longitude={user.longitude} />
                    ) : (
                        <div className="h-[150px] bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-sm">
                            Waiting for location...
                        </div>
                    )}
                </div>

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
                        {['CANCELLED_FREE', 'CANCELLED_CHARGED'].includes(job.status) && job.cancellationReason && (
                            <div className="text-sm text-red-600 mb-3">Cancel reason: {job.cancellationReason}</div>
                        )}

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

            {/* Completion Dialog */}
            {completionDialog.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
                        <div className="space-y-1">
                            <h3 className="text-lg font-semibold text-gray-900">Complete Job</h3>
                            <p className="text-sm text-gray-600">Please provide completion details</p>
                        </div>

                        <div className="space-y-2">
                            <Label>Completion Notes *</Label>
                            <textarea
                                className="w-full rounded-md border border-gray-200 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                rows={4}
                                placeholder="Describe what was completed..."
                                value={completionNotes}
                                onChange={(e) => setCompletionNotes(e.target.value)}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Completion Photos (URL)</Label>
                            <Input
                                placeholder="http://..."
                                value={completionPhotos}
                                onChange={(e) => setCompletionPhotos(e.target.value)}
                            />
                            <p className="text-xs text-gray-500">Enter a URL for now (e.g. from Google Drive/Photos)</p>
                        </div>

                        {(() => {
                            // Find the job to check if it's a cleaning job
                            const job = jobs?.find((j: any) => j.id === completionDialog.jobId);
                            const isCleaningJob = job?.category === 'CLEANING';

                            // For cleaning jobs, parts are always N/A (don't show the field)
                            if (isCleaningJob) {
                                return (
                                    <div className="space-y-2">
                                        <Label className="text-gray-500">Parts Required: N/A (Cleaning jobs)</Label>
                                    </div>
                                );
                            }

                            // For non-cleaning jobs, show parts confirmation
                            return (
                                <>
                                    <div className="space-y-2">
                                        <Label>Parts Required? *</Label>
                                        <div className="flex gap-2">
                                            <Button
                                                type="button"
                                                variant={partsRequired === 'YES' ? 'default' : 'outline'}
                                                onClick={() => setPartsRequired('YES')}
                                                className="flex-1"
                                            >
                                                Yes
                                            </Button>
                                            <Button
                                                type="button"
                                                variant={partsRequired === 'NO' ? 'default' : 'outline'}
                                                onClick={() => setPartsRequired('NO')}
                                                className="flex-1"
                                            >
                                                No
                                            </Button>
                                            <Button
                                                type="button"
                                                variant={partsRequired === 'N/A' ? 'default' : 'outline'}
                                                onClick={() => setPartsRequired('N/A')}
                                                className="flex-1"
                                            >
                                                N/A
                                            </Button>
                                        </div>
                                    </div>

                                    {partsRequired === 'YES' && (
                                        <div className="space-y-2">
                                            <Label>Parts Notes *</Label>
                                            <textarea
                                                className="w-full rounded-md border border-gray-200 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                rows={3}
                                                placeholder="Describe the parts used..."
                                                value={partsNotes}
                                                onChange={(e) => setPartsNotes(e.target.value)}
                                                required
                                            />
                                            <p className="text-xs text-gray-500">Photos can be added later (optional)</p>
                                        </div>
                                    )}
                                </>
                            );
                        })()}

                        <div className="flex justify-end gap-3 pt-2">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setCompletionDialog({ open: false });
                                    setCompletionNotes('');
                                    setCompletionPhotos('');
                                    setPartsRequired('');
                                    setPartsNotes('');
                                }}
                                disabled={isSubmitting}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="default"
                                onClick={submitCompletion}
                                disabled={isSubmitting}
                                className="bg-green-600 hover:bg-green-700"
                            >
                                {isSubmitting ? 'Completing...' : 'Complete Job'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
