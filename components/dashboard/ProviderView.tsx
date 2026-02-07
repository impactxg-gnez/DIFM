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
import { MapPin, AlertTriangle } from 'lucide-react';
import { CameraUpload } from '@/components/ui/CameraUpload';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

import { ProviderOnboarding } from '../provider/ProviderOnboarding';

export function ProviderView({ user }: { user: any }) {
    console.log('ProviderView user:', user);
    // Enable onboarding only if provider hasn't set up capabilities
    // If capabilities are set (by admin), allow skipping KYC/compliance
    const [showOnboarding, setShowOnboarding] = useState(!user.capabilities);

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
                        const { latitude, longitude, accuracy } = position.coords;
                        
                        // Only update if accuracy is reasonable (within 100m) and location has changed significantly (>10m)
                        if (accuracy > 100) {
                            console.warn(`Location accuracy is poor: ${accuracy}m, skipping update`);
                            return;
                        }

                        // Check if location has changed significantly (more than ~10 meters)
                        const currentLat = user.latitude;
                        const currentLng = user.longitude;
                        if (currentLat && currentLng) {
                            // Calculate distance in meters using Haversine formula
                            const R = 6371e3; // Earth radius in meters
                            const φ1 = currentLat * Math.PI / 180;
                            const φ2 = latitude * Math.PI / 180;
                            const Δφ = (latitude - currentLat) * Math.PI / 180;
                            const Δλ = (longitude - currentLng) * Math.PI / 180;
                            const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                                Math.cos(φ1) * Math.cos(φ2) *
                                Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
                            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                            const distance = R * c; // Distance in meters

                            // Only update if moved more than 10 meters
                            if (distance < 10) {
                                console.log(`Location unchanged (${distance.toFixed(1)}m), skipping update`);
                                return;
                            }
                        }

                        try {
                            const response = await fetch('/api/user/location', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ latitude, longitude })
                            });
                            if (response.ok) {
                                console.log(`Location updated: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} (accuracy: ${accuracy?.toFixed(0)}m)`);
                            }
                        } catch (e) {
                            console.error("Failed to heart-beat location", e);
                        }
                    },
                    (error) => {
                        console.error("Location error", error);
                        // Don't spam errors if permission denied
                        if (error.code !== error.PERMISSION_DENIED) {
                            console.warn("Geolocation error:", error.message);
                        }
                    },
                    { 
                        enableHighAccuracy: true,
                        timeout: 10000, // 10 second timeout
                        maximumAge: 5000 // Don't use cached positions older than 5 seconds
                    }
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
            const res = await fetch(`/api/jobs/${jobId}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'ASSIGNED' })
            });
            if (res.ok) {
                mutate();
            } else {
                const err = await res.json();
                alert(`Failed to accept: ${err.error || 'Job may have expired'}`);
                mutate();
            }
        } catch (e) {
            console.error(e);
        }
    };

    const confirmArrival = async (jobId: string) => {
        await fetch(`/api/jobs/${jobId}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'ARRIVING' })
        });
        mutate();
    };

    const confirmAccess = async (jobId: string) => {
        await fetch(`/api/jobs/${jobId}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isAccessAvailable: true })
        });
        mutate();
    };

    const [completionDialog, setCompletionDialog] = useState<{ open: boolean; jobId?: string }>({ open: false });
    const [completionNotes, setCompletionNotes] = useState('');
    const [completionPhotos, setCompletionPhotos] = useState('');
    const [completionCoords, setCompletionCoords] = useState<{ lat: number, lng: number } | null>(null);
    const [locationWarning, setLocationWarning] = useState<string | null>(null);
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
                    firstName: 'milestone5_update',
                    // New Geolocation Fields
                    completionLat: completionCoords?.lat,
                    completionLng: completionCoords?.lng,
                    completionLocationVerified: !locationWarning, // True if no warning

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
                <div className="bg-zinc-900 border-blue-500/20 shadow-sm shadow-blue-900/10 flex flex-col md:flex-row gap-4 items-start md:items-center">
                    <div className="flex-1 space-y-1">
                        <h3 className="font-semibold text-white flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-blue-500" />
                            Location Services Active
                        </h3>
                        <p className="text-sm text-gray-400">
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
                            <div className="h-[150px] bg-zinc-800/50 text-gray-400">
                                Waiting for location...
                            </div>
                        )}
                    </div>
                </div>

                <Card className="p-6">
                    <h2 className="text-xl font-bold mb-2">Account Status: {user.providerStatus || 'PENDING'}</h2>
                    <p className="text-gray-400">
                        Your provider account is pending admin approval. You will be able to receive jobs once approved.
                    </p>
                    <p className="text-sm text-gray-400 mt-2">
                        Your profile has been pre-configured. Please wait for admin approval.
                    </p>
                </Card>
            </div>
        );
    }

    if (!jobs) return <div>Loading jobs...</div>;

    // V1: Available jobs are those in ASSIGNING status
    // The backend already filters by category/capabilities, so show all ASSIGNING jobs returned
    const availableJobs = jobs.filter((j: any) => j.status === 'ASSIGNING');
    // V1: My jobs are those assigned to me or in progress
    const myJobs = jobs.filter((j: any) => j.providerId === user.id);

    // Toggle online status
    const toggleOnlineStatus = async (newStatus: boolean) => {
        try {
            const res = await fetch('/api/user/online-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isOnline: newStatus })
            });
            if (res.ok) {
                // Refresh user data
                window.location.reload();
            } else {
                const error = await res.json();
                alert(`Failed to update status: ${error.error}`);
            }
        } catch (e) {
            console.error('Failed to toggle online status', e);
            alert('Failed to update online status');
        }
    };

    return (
        <div className="grid md:grid-cols-2 gap-8">
            {/* Available Jobs Column */}
            <div className="space-y-4">
                {/* Online Status Toggle */}
                <div className="bg-zinc-900 border-blue-500/20 shadow-sm shadow-blue-900/10 mb-4 p-4 rounded-lg">
                    <div className="flex justify-between items-center">
                        <div>
                            <h3 className="font-semibold text-gray-900">Online Status</h3>
                            <p className="text-sm text-gray-400">
                                {user.isOnline ? 'You are online and receiving job offers' : 'You are offline and will not receive new job offers'}
                            </p>
                        </div>
                        <Button
                            onClick={() => toggleOnlineStatus(!user.isOnline)}
                            variant={user.isOnline ? "default" : "outline"}
                            className={user.isOnline ? "bg-green-600 hover:bg-green-700" : ""}
                        >
                            {user.isOnline ? "🟢 Online" : "🔴 Offline"}
                        </Button>
                    </div>
                </div>

                {/* Location Tracker */}
                <div className="bg-zinc-900 border-blue-500/20 shadow-sm shadow-blue-900/10 mb-6">
                    <div className="flex justify-between items-start mb-4">
                        <div className="space-y-1">
                            <h3 className="font-semibold text-white flex items-center gap-2">
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
                        <div className="h-[150px] bg-zinc-800/50 text-gray-400">
                            Waiting for location...
                        </div>
                    )}
                </div>

                <h2 className="text-xl font-semibold flex items-center gap-2 text-gray-900">
                    Available Jobs
                    <span className="text-xs bg-gray-200 px-2 py-1 rounded-full text-gray-900">{availableJobs.length}</span>
                </h2>
                {availableJobs.map((job: any) => (
                    <Card key={job.id} className="p-4 border-l-4 border-l-yellow-500/50 bg-zinc-900/50">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="font-semibold text-gray-900">{job.category} - {job.description}</h3>
                                <p className="text-sm text-gray-400">{job.location}</p>
                                <div className="mt-2 text-lg font-bold text-blue-600">£{job.fixedPrice}</div>
                                <p className="text-xs text-gray-400 mt-1">{job.isASAP ? 'ASAP' : new Date(job.scheduledAt).toLocaleString()}</p>
                            </div>
                        </div>
                        <Button onClick={() => acceptJob(job.id)} className="w-full">Accept Job</Button>
                    </Card>
                ))}
                {availableJobs.length === 0 && <p className="text-gray-400 text-sm">No new jobs matching your skills nearby.</p>}
            </div>

            {/* My Active Jobs Column */}
            <div className="space-y-4">
                <h2 className="text-xl font-semibold text-gray-900">My Schedule</h2>
                {myJobs.map((job: any) => (
                    <Card key={job.id} className="p-4 border-l-4 border-blue-500">
                        <div className="flex justify-between items-center mb-2">
                            <Badge status={job.status}>{job.status.replace('_', ' ')}</Badge>
                            <span className="text-sm font-mono font-bold text-gray-900">£{job.fixedPrice}</span>
                        </div>
                        <h3 className="font-semibold mb-1 text-gray-900">{job.description}</h3>
                        <p className="text-sm text-gray-400 mb-2 flex items-start gap-1">
                            <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                            {job.location}
                        </p>

                        {(job.status === 'ASSIGNED' || job.status === 'PREAUTHORISED') && (
                            <div className="mb-4 p-3 bg-blue-50 rounded border border-blue-100">
                                <p className="text-xs font-semibold text-blue-700 uppercase mb-1">Arrival Window</p>
                                <p className="text-sm text-blue-900">
                                    {job.arrivalWindowStart ? (
                                        `${new Date(job.arrivalWindowStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(job.arrivalWindowEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                                    ) : 'ASAP'}
                                </p>
                            </div>
                        )}

                        {job.status === 'IN_PROGRESS' && job.timerStartedAt && (
                            <div className="mb-4 p-3 bg-green-50 rounded border border-green-100 flex justify-between items-center">
                                <div>
                                    <p className="text-[10px] font-semibold text-green-700 uppercase">Timer Active</p>
                                    <p className="text-lg font-black font-mono text-green-900">
                                        {Math.floor((Date.now() - new Date(job.timerStartedAt).getTime()) / 60000)}m elapsed
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-semibold text-green-700 uppercase">Access</p>
                                    <p className="text-xs text-green-900 font-bold">Confirmed ✅</p>
                                </div>
                            </div>
                        )}

                        <div className="flex flex-col gap-2">
                            {job.status === 'ASSIGNED' && (
                                <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">Waiting for pre-authorization...</p>
                            )}

                            {job.status === 'PREAUTHORISED' && (
                                <Button onClick={() => confirmArrival(job.id)} className="w-full bg-blue-600 hover:bg-blue-700" variant="default">Confirm Arrival</Button>
                            )}

                            {job.status === 'ARRIVING' && (
                                <>
                                    {!job.isAccessAvailable ? (
                                        <Button onClick={() => confirmAccess(job.id)} className="w-full bg-indigo-600 hover:bg-indigo-700">Confirm Access to Property</Button>
                                    ) : (
                                        <Button onClick={() => updateStatus(job.id, 'IN_PROGRESS')} className="w-full bg-green-600 hover:bg-green-700">Start Timer</Button>
                                    )}
                                </>
                            )}

                            {job.status === 'IN_PROGRESS' && (
                                <div className="grid grid-cols-2 gap-2">
                                    <Button onClick={() => updateStatus(job.id, 'COMPLETED')} className="bg-green-600 hover:bg-green-700">Complete Job</Button>
                                    <Button
                                        onClick={async () => {
                                            if (confirm('Report a mismatch? This will stop the timer and notify the admin.')) {
                                                await updateStatus(job.id, 'SCOPE_MISMATCH');
                                            }
                                        }}
                                        variant="outline"
                                        className="border-red-200 text-red-600"
                                    >
                                        Mismatch
                                    </Button>
                                </div>
                            )}

                            {['COMPLETED', 'CAPTURED', 'PAID_OUT', 'CLOSED'].includes(job.status) && (
                                <div className="w-full text-center text-sm text-green-600 font-medium py-2">Job Done / Recorded</div>
                            )}
                        </div>
                    </Card>
                ))}
            </div>

            {/* Completion Dialog */}
            {completionDialog.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-zinc-900/90 border border-white/10 space-y-4">
                        <div className="space-y-1">
                            <h3 className="text-lg font-semibold text-gray-900">Complete Job</h3>
                            <p className="text-sm text-gray-400">Please provide completion details</p>
                        </div>

                        <div className="space-y-2">
                            <Label>Completion Notes *</Label>
                            <textarea
                                className="w-full rounded-md border border-white/10 text-white placeholder:text-gray-600 focus:border-blue-500"
                                rows={4}
                                placeholder="Describe what was completed..."
                                value={completionNotes}
                                onChange={(e) => setCompletionNotes(e.target.value)}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Completion Photo *</Label>
                            <CameraUpload
                                onCapture={(photo, lat, lng) => {
                                    setCompletionPhotos(photo); // In real app, this would be a URL after upload
                                    setCompletionCoords({ lat, lng });

                                    // Verify distance
                                    const job = jobs?.find((j: any) => j.id === completionDialog.jobId);
                                    if (job && job.latitude && job.longitude) {
                                        const R = 6371e3; // metres
                                        const φ1 = lat * Math.PI / 180; // φ, λ in radians
                                        const φ2 = job.latitude * Math.PI / 180;
                                        const Δφ = (job.latitude - lat) * Math.PI / 180;
                                        const Δλ = (job.longitude - lng) * Math.PI / 180;

                                        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                                            Math.cos(φ1) * Math.cos(φ2) *
                                            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
                                        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                                        const d = R * c; // in metres

                                        if (d > 200) { // 200m radius
                                            setLocationWarning(`You are ${(d / 1000).toFixed(2)}km from the job site. Please simulate being closer.`);
                                        } else {
                                            setLocationWarning(null);
                                        }
                                    }
                                }}
                            />
                            {locationWarning && (
                                <div className="text-amber-600 text-sm flex items-center gap-2 bg-amber-50 p-2 rounded">
                                    <AlertTriangle className="w-4 h-4 shrink-0" />
                                    {locationWarning}
                                </div>
                            )}
                        </div>

                        {(() => {
                            // Find the job to check if it's a cleaning job
                            const job = jobs?.find((j: any) => j.id === completionDialog.jobId);
                            const isCleaningJob = job?.category === 'CLEANING';

                            // For cleaning jobs, parts are always N/A (don't show the field)
                            if (isCleaningJob) {
                                return (
                                    <div className="space-y-2">
                                        <Label className="text-gray-400">Parts Required: N/A (Cleaning jobs)</Label>
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
                                                className="w-full rounded-md border border-white/10 text-white placeholder:text-gray-600 focus:border-blue-500"
                                                rows={3}
                                                placeholder="Describe the parts used..."
                                                value={partsNotes}
                                                onChange={(e) => setPartsNotes(e.target.value)}
                                                required
                                            />
                                            <p className="text-xs text-gray-400">Photos can be added later (optional)</p>
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
                                    setCompletionCoords(null);
                                    setLocationWarning(null);
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
