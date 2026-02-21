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
import { MapPin, AlertTriangle, Timer, Plus, Trash2 } from 'lucide-react';
import { CameraUpload } from '@/components/ui/CameraUpload';
import { RemoteImage } from '@/components/ui/RemoteImage';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function TimerDisplay({ startTime }: { startTime: string | Date }) {
    const [elapsed, setElapsed] = useState('');

    useEffect(() => {
        const start = new Date(startTime).getTime();
        const update = () => {
            const now = Date.now();
            const diff = Math.max(0, now - start);
            const mins = Math.floor(diff / 60000);
            const secs = Math.floor((diff % 60000) / 1000);
            setElapsed(`${mins}m ${secs.toString().padStart(2, '0')}s`);
        };
        update();
        const interval = setInterval(update, 1000);
        return () => clearInterval(interval);
    }, [startTime]);

    return <span className="font-mono">{elapsed}</span>;
}


export function ProviderView({ user }: { user: any }) {
    console.log('ProviderView user:', user);

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

    const declineJob = async (jobId: string) => {
        if (!window.confirm('Are you sure you want to decline this job? You will not be able to accept it later if you do.')) {
            return;
        }
        try {
            const res = await fetch(`/api/jobs/${jobId}/decline`, {
                method: 'POST'
            });
            if (res.ok) {
                mutate();
            } else {
                const err = await res.json();
                alert(`Failed to decline: ${err.error}`);
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
            body: JSON.stringify({ status: 'ARRIVED' })
        });
        mutate();
    };

    const [completionDialog, setCompletionDialog] = useState<{ open: boolean; jobId?: string }>({ open: false });
    const [completionNotes, setCompletionNotes] = useState('');
    const [completionPhotos, setCompletionPhotos] = useState('');
    const [completionCoords, setCompletionCoords] = useState<{ lat: number, lng: number } | null>(null);
    const [locationWarning, setLocationWarning] = useState<string | null>(null);
    const [partsRequired, setPartsRequired] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [arrivalPhoto, setArrivalPhoto] = useState<string | null>(null);

    // Parts Request State
    const [partsDialog, setPartsDialog] = useState<{ open: boolean; jobId?: string; visitId?: string }>({ open: false });
    const [partsItems, setPartsItems] = useState<{ name: string; price: number }[]>([{ name: '', price: 0 }]);
    const [partsNotes, setPartsNotes] = useState('');
    const [isSubmittingParts, setIsSubmittingParts] = useState(false);

    const handleAddPart = () => setPartsItems([...partsItems, { name: '', price: 0 }]);
    const handleRemovePart = (index: number) => setPartsItems(partsItems.filter((_, i) => i !== index));
    const handlePartChange = (index: number, field: 'name' | 'price', value: string | number) => {
        const newItems = [...partsItems];
        newItems[index] = { ...newItems[index], [field]: value };
        setPartsItems(newItems);
    };

    const submitPartsRequest = async () => {
        if (!partsDialog.jobId || !partsDialog.visitId) return;
        if (partsItems.some(item => !item.name || item.price <= 0)) {
            alert('Please provide valid name and price for all parts');
            return;
        }

        setIsSubmittingParts(true);
        try {
            const res = await fetch(`/api/visits/${partsDialog.visitId}/parts-request`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    partsBreakdown: {
                        items: partsItems,
                        totalCost: partsItems.reduce((sum, item) => sum + item.price, 0)
                    },
                    partsNotes
                })
            });

            if (res.ok) {
                setPartsDialog({ open: false });
                setPartsItems([{ name: '', price: 0 }]);
                setPartsNotes('');
                mutate();
                alert('Parts request submitted and timer paused.');
            } else {
                const err = await res.json();
                alert(`Error: ${err.error}`);
            }
        } catch (e) {
            console.error('Parts request failed', e);
        } finally {
            setIsSubmittingParts(false);
        }
    };

    const resumeWork = async (visitId: string) => {
        try {
            const res = await fetch(`/api/visits/${visitId}/resume`, {
                method: 'POST',
            });
            if (res.ok) {
                mutate();
            } else {
                const err = await res.json();
                alert(`Error resuming: ${err.error}`);
            }
        } catch (e) {
            console.error('Resume failed', e);
        }
    };

    const [flagDialog, setFlagDialog] = useState<{ open: boolean; jobId?: string }>({ open: false });
    const [flagReason, setFlagReason] = useState('');
    const [flagNote, setFlagNote] = useState('');
    const [flagPhotos, setFlagPhotos] = useState('');

    const updateStatus = async (jobId: string, status: string) => {
        if (status === 'COMPLETED') {
            setCompletionDialog({ open: true, jobId });
            return;
        }

        const body: any = { status };
        if (status === 'IN_PROGRESS' && arrivalPhoto) {
            body.arrivalPhotos = arrivalPhoto;
        }

        await fetch(`/api/jobs/${jobId}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (status === 'IN_PROGRESS') {
            setArrivalPhoto(null);
        }
        mutate();
    };

    const submitFlag = async () => {
        if (!flagDialog.jobId || !flagReason) return;
        setIsSubmitting(true);
        try {
            const res = await fetch(`/api/jobs/${flagDialog.jobId}/flag`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reason: flagReason,
                    note: flagNote,
                    photos: flagPhotos,
                    providerId: user.id
                })
            });
            if (res.ok) {
                setFlagDialog({ open: false });
                setFlagReason('');
                setFlagNote('');
                setFlagPhotos('');
                mutate();
            } else {
                const err = await res.json();
                alert(`Flagging failed: ${err.error}`);
            }
        } catch (e) {
            console.error('Flag error', e);
        } finally {
            setIsSubmitting(false);
        }
    };

    const submitCompletion = async () => {
        if (!completionDialog.jobId) return;
        if (!completionNotes.trim()) {
            alert('Completion notes are required');
            return;
        }

        if (!completionPhotos || completionPhotos.trim() === '') {
            alert('Photo/Video evidence is required for completion');
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
            const res = await fetch(`/api/jobs/${completionDialog.jobId}/status`, {
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

            if (res.ok) {
                setCompletionDialog({ open: false });
                setCompletionNotes('');
                setCompletionPhotos('');
                setPartsRequired('');
                setPartsNotes('');
                mutate();
            } else {
                const err = await res.json();
                alert(`Completion failed: ${err.error || 'Server error'}`);
            }
        } catch (e) {
            console.error('Completion error', e);
            alert('Failed to complete job');
        } finally {
            setIsSubmitting(false);
        }
    };

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
    // V1: My jobs are those assigned to me or in progress or flagged by me
    const myJobs = jobs.filter((j: any) => j.providerId === user.id || (j.status === 'FLAGGED_REVIEW' && j.flaggedById === user.id));

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
                            <h3 className="font-semibold text-white">Online Status</h3>
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

                <h2 className="text-xl font-semibold flex items-center gap-2 text-white">
                    Available Jobs
                    <span className="text-xs bg-gray-200 px-2 py-1 rounded-full text-black">{availableJobs.length}</span>
                </h2>
                {availableJobs.map((job: any) => (
                    <Card key={job.id} className="p-4 border-l-4 border-l-yellow-500/50 bg-zinc-900/50">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="font-semibold text-white">{job.category} - {job.description}</h3>
                                <p className="text-sm text-gray-400">{job.location}</p>

                                {/* Photo Display for Provider Review */}
                                {job.visits?.some((v: any) => v.scope_photos) && (
                                    <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
                                        {job.visits.map((v: any) => v.scope_photos?.split(',').map((url: string, i: number) => (
                                            <RemoteImage key={`${v.id}-${i}`} path={url} bucket="SCOPE" className="w-20 h-20 object-cover rounded border border-white/10" />
                                        )))}
                                    </div>
                                )}

                                <div className="mt-2 text-lg font-bold text-blue-600">£{job.fixedPrice}</div>
                                <p className="text-xs text-gray-400 mt-1">{job.isASAP ? 'ASAP' : new Date(job.scheduledAt).toLocaleString()}</p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={() => acceptJob(job.id)} className="flex-1 font-bold bg-blue-600 hover:bg-blue-700">Accept</Button>
                            <Button
                                variant="outline"
                                className="flex-1 border-white/10 hover:bg-white/5 bg-zinc-800/50"
                                onClick={() => declineJob(job.id)}
                            >
                                Decline
                            </Button>
                            <Button
                                variant="outline"
                                className="border-red-500/30 text-red-500 hover:bg-red-500/10"
                                onClick={() => setFlagDialog({ open: true, jobId: job.id })}
                            >
                                <AlertTriangle className="w-4 h-4 mr-1" /> Flag
                            </Button>
                        </div>
                    </Card>
                ))}
                {availableJobs.length === 0 && <p className="text-gray-400 text-sm">No new jobs matching your skills nearby.</p>}
            </div>

            {/* My Active Jobs Column */}
            <div className="space-y-4">
                <h2 className="text-xl font-semibold text-white">My Schedule</h2>
                {myJobs.map((job: any) => (
                    <Card key={job.id} className="p-4 border-l-4 border-blue-500">
                        <div className="flex justify-between items-center mb-2">
                            <Badge status={job.status}>{job.status.replace('_', ' ')}</Badge>
                            <span className="text-sm font-mono font-bold text-white">£{job.fixedPrice}</span>
                        </div>
                        <h3 className="font-semibold mb-1 text-white">{job.description}</h3>

                        {/* Photo Display for Provider Schedule */}
                        {job.visits?.some((v: any) => v.scope_photos || v.partsPhotos) && (
                            <div className="mt-3 mb-4 flex gap-2 overflow-x-auto pb-2 border-t border-white/5 pt-3">
                                {job.visits.map((v: any) => (
                                    <div key={v.id} className="flex gap-2">
                                        {v.scope_photos?.split(',').map((url: string, i: number) => (
                                            <div key={`scope-${v.id}-${i}`} className="space-y-1">
                                                <RemoteImage path={url} bucket="SCOPE" className="w-16 h-16 object-cover rounded border border-white/10" />
                                                <p className="text-[7px] text-gray-500 text-center uppercase font-bold">Scope</p>
                                            </div>
                                        ))}
                                        {v.partsPhotos?.split(',').map((url: string, i: number) => (
                                            <div key={`parts-${v.id}-${i}`} className="space-y-1">
                                                <RemoteImage path={url} bucket="PART" className="w-16 h-16 object-cover rounded border border-white/10" />
                                                <p className="text-[7px] text-gray-500 text-center uppercase font-bold">Part</p>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        )}

                        {job.status === 'FLAGGED_REVIEW' && (
                            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded text-red-400">
                                <p className="text-xs font-bold uppercase mb-1 flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" /> Flagged for Review
                                </p>
                                <p className="text-sm">Reason: {job.flagReason?.replace('_', ' ')}</p>
                                {job.flagNote && <p className="text-xs mt-1 text-gray-400 italic">"{job.flagNote}"</p>}
                            </div>
                        )}

                        {job.status === 'MISMATCH_PENDING' && (
                            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded text-red-400">
                                <p className="text-xs font-bold uppercase mb-1 flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" /> Mismatch Enforcement Lock
                                </p>
                                <p className="text-sm">This job is locked awaiting tier recalculation or admin rebook.</p>
                                <p className="text-xs mt-1 text-gray-400">The customer has been notified to upgrade the visit or rebook. Do not perform further work until resolved.</p>
                            </div>
                        )}
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

                        {(job.status === 'IN_PROGRESS' || job.status === 'ARRIVED') && job.timerStartedAt && (
                            <div className="mb-4 p-3 bg-green-50 rounded border border-green-100 flex justify-between items-center">
                                <div>
                                    <p className="text-[10px] font-semibold text-green-700 uppercase">Timer Active</p>
                                    <div className="text-lg font-black font-mono text-green-900">
                                        <TimerDisplay startTime={job.timerStartedAt} /> elapsed
                                    </div>
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
                                <Button onClick={() => confirmAccess(job.id)} className="w-full bg-indigo-600 hover:bg-indigo-700">Confirm Access to Property</Button>
                            )}

                            {job.status === 'ARRIVED' && (
                                <div className="space-y-3 p-3 bg-zinc-900/50 rounded border border-blue-500/20">
                                    <p className="text-xs font-semibold text-blue-500 uppercase">Mandatory Arrival Photo</p>
                                    <CameraUpload
                                        label="Take Arrival Photo"
                                        onCapture={(photo) => setArrivalPhoto(photo)}
                                    />
                                    {arrivalPhoto && (
                                        <Button
                                            onClick={() => updateStatus(job.id, 'IN_PROGRESS')}
                                            className="w-full bg-blue-600 hover:bg-blue-700"
                                        >
                                            Start Work
                                        </Button>
                                    )}
                                    {!arrivalPhoto && (
                                        <p className="text-[10px] text-gray-500 italic text-center">
                                            Please upload a photo of the property access to enable 'Start Work'
                                        </p>
                                    )}
                                </div>
                            )}

                            {job.status === 'IN_PROGRESS' && (
                                <div className="space-y-2">
                                    <div className="grid grid-cols-2 gap-2">
                                        <Button onClick={() => updateStatus(job.id, 'COMPLETED')} className="bg-green-600 hover:bg-green-700">Complete Job</Button>
                                        <Button
                                            onClick={async () => {
                                                if (confirm('Report a mismatch? This will stop the timer and notify the admin.')) {
                                                    await updateStatus(job.id, 'MISMATCH_PENDING');
                                                }
                                            }}
                                            variant="outline"
                                            className="border-red-200 text-red-600"
                                        >
                                            Mismatch
                                        </Button>
                                    </div>
                                    <Button
                                        onClick={() => {
                                            const visit = job.visits?.[0]; // Default to first visit for now
                                            setPartsDialog({ open: true, jobId: job.id, visitId: visit?.id });
                                        }}
                                        variant="outline"
                                        className="w-full bg-amber-600 hover:bg-amber-700 text-white border-none"
                                    >
                                        Request Parts
                                    </Button>
                                </div>
                            )}

                            {job.status === 'PARTS_PENDING_APPROVAL' && (
                                <div className="space-y-2">
                                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded text-amber-500 text-sm">
                                        <p className="font-bold flex items-center gap-1"><Timer className="w-3 h-3" /> Timer Paused</p>
                                        <p>Awaiting parts approval.</p>
                                    </div>
                                    {job.visits?.some((v: any) => v.partsStatus === 'APPROVED') && (
                                        <Button
                                            onClick={() => {
                                                const visit = job.visits.find((v: any) => v.partsStatus === 'APPROVED');
                                                if (visit) resumeWork(visit.id);
                                            }}
                                            className="w-full bg-green-600 hover:bg-green-700"
                                        >
                                            Resume Work
                                        </Button>
                                    )}
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
            {
                completionDialog.open && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                        <div className="bg-zinc-900/90 border border-white/10 space-y-4">
                            <div className="space-y-1">
                                <h3 className="text-lg font-semibold text-white">Complete Job</h3>
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
                )
            }
            {/* Flagging Dialog */}
            {
                flagDialog.open && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                        <div className="bg-zinc-900 border border-white/10 p-6 rounded-lg max-w-md w-full mx-4 space-y-4">
                            <div className="space-y-1">
                                <h3 className="text-lg font-semibold text-red-500 flex items-center gap-2">
                                    <AlertTriangle className="w-5 h-5" />
                                    Flag Job for Review
                                </h3>
                                <p className="text-sm text-gray-400">Selecting a reason will pause the job and notify the admin.</p>
                            </div>

                            <div className="space-y-2">
                                <Label>Reason for Flagging *</Label>
                                <div className="grid grid-cols-1 gap-2">
                                    {[
                                        { id: 'scope_too_large', label: 'Scope too large' },
                                        { id: 'wrong_capability', label: 'Wrong capability' },
                                        { id: 'photo_mismatch', label: 'Photo mismatch' },
                                        { id: 'safety_issue', label: 'Safety issue' }
                                    ].map((reason) => (
                                        <Button
                                            key={reason.id}
                                            type="button"
                                            variant={flagReason === reason.id ? 'default' : 'outline'}
                                            onClick={() => setFlagReason(reason.id)}
                                            className={`justify-start ${flagReason === reason.id ? 'bg-red-600' : 'border-white/10'}`}
                                        >
                                            {reason.label}
                                        </Button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Optional Note</Label>
                                <textarea
                                    className="w-full rounded-md border border-white/10 bg-zinc-800 text-white placeholder:text-gray-600 focus:border-red-500 p-2"
                                    rows={3}
                                    placeholder="Add any details for the admin..."
                                    value={flagNote}
                                    onChange={(e) => setFlagNote(e.target.value)}
                                />
                            </div>

                            {flagReason === 'photo_mismatch' && (
                                <div className="space-y-4 pt-2 border-t border-white/10">
                                    <Label className="text-red-400">Add Evidence Photo (Recommended)</Label>
                                    <CameraUpload
                                        onCapture={(photo) => setFlagPhotos(photo)}
                                    />
                                    {flagPhotos && (
                                        <p className="text-xs text-green-500">Photo captured successfully</p>
                                    )}
                                </div>
                            )}

                            <div className="flex justify-end gap-3 pt-2">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setFlagDialog({ open: false });
                                        setFlagReason('');
                                        setFlagNote('');
                                    }}
                                    disabled={isSubmitting}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    variant="destructive"
                                    onClick={submitFlag}
                                    disabled={isSubmitting || !flagReason}
                                    className="bg-red-600 hover:bg-red-700"
                                >
                                    {isSubmitting ? 'Flagging...' : 'Confirm Flag'}
                                </Button>
                            </div>
                        </div>
                    </div>
                )
            }
            {/* Parts Request Dialog */}
            {
                partsDialog.open && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                        <div className="bg-zinc-900 border border-white/10 text-white p-6 rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
                            <h3 className="text-xl font-bold text-amber-500 mb-4">Request Parts</h3>
                            <p className="text-sm text-gray-400 mb-6">List the parts required for this job. Total cost will be added to the customer's bill once approved.</p>

                            <div className="space-y-4">
                                {partsItems.map((item, index) => (
                                    <div key={index} className="flex gap-2 items-end">
                                        <div className="flex-1 space-y-2">
                                            <Label>Part Name</Label>
                                            <Input
                                                placeholder="e.g. 5m HDMI Cable"
                                                value={item.name}
                                                onChange={(e) => handlePartChange(index, 'name', e.target.value)}
                                                className="bg-zinc-800 border-white/10"
                                            />
                                        </div>
                                        <div className="w-24 space-y-2">
                                            <Label>Price (£)</Label>
                                            <Input
                                                type="number"
                                                placeholder="0.00"
                                                value={item.price}
                                                onChange={(e) => handlePartChange(index, 'price', parseFloat(e.target.value) || 0)}
                                                className="bg-zinc-800 border-white/10"
                                            />
                                        </div>
                                        {partsItems.length > 1 && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleRemovePart(index)}
                                                className="text-red-500 hover:bg-red-500/10 h-10 w-10 p-0"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        )}
                                    </div>
                                ))}

                                <Button
                                    variant="outline"
                                    onClick={handleAddPart}
                                    className="w-full border-dashed border-white/20 text-gray-400 hover:text-white"
                                >
                                    <Plus className="w-4 h-4 mr-2" /> Add Another Part
                                </Button>

                                <div className="pt-4 border-t border-white/10 space-y-2">
                                    <Label>Notes (Optional)</Label>
                                    <textarea
                                        className="w-full rounded-md border border-white/10 bg-zinc-800 text-white p-2 min-h-[80px]"
                                        placeholder="Explain why these parts are needed..."
                                        value={partsNotes}
                                        onChange={(e) => setPartsNotes(e.target.value)}
                                    />
                                </div>

                                <div className="flex justify-between items-center pt-2">
                                    <div className="text-lg font-bold">
                                        Total: £{partsItems.reduce((sum, i) => sum + i.price, 0).toFixed(2)}
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="ghost"
                                            onClick={() => setPartsDialog({ open: false })}
                                            className="text-white"
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            onClick={submitPartsRequest}
                                            disabled={isSubmittingParts}
                                            className="bg-amber-600 hover:bg-amber-700"
                                        >
                                            {isSubmittingParts ? 'Submitting...' : 'Send Request'}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
