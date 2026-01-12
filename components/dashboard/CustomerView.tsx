'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { JobCreationForm } from './JobCreationForm';
import { DispatchTimer } from './DispatchTimer';
import { ProviderMap } from './ProviderMap';
import { UserLocationMap } from './UserLocationMap';
import { Plus, MapPin, Star, LogOut, ArrowLeft, Edit2, Check, X } from 'lucide-react';
import { BottomNav } from './BottomNav';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

/**
 * Get customer-friendly status display
 * Don't show DISPATCHED if no provider is assigned yet
 */
function getCustomerStatus(job: any): string {
    // If status is DISPATCHED but no provider assigned, show as "Looking for provider"
    if (job.status === 'DISPATCHED' && !job.providerId) {
        return 'Looking for provider';
    }

    // Map other statuses to customer-friendly labels
    const statusMap: Record<string, string> = {
        'CREATED': 'Created',
        'DISPATCHED': 'Provider assigned',
        'ACCEPTED': 'Accepted by provider',
        'IN_PROGRESS': 'In progress',
        'COMPLETED': 'Completed',
        'CLOSED': 'Closed',
        'PAID': 'Paid',
        'CANCELLED_FREE': 'Cancelled',
        'CANCELLED_CHARGED': 'Cancelled (charged)',
    };

    return statusMap[job.status] || job.status.replace('_', ' ');
}

export function CustomerView({ user }: { user: any }) {
    const router = useRouter();
    const { data: jobs, mutate } = useSWR('/api/jobs', fetcher, { refreshInterval: 5000 });

    // Tab navigation state
    const [activeTab, setActiveTab] = useState<'NEW_TASK' | 'STATUS' | 'HISTORY' | 'ACCOUNT'>('NEW_TASK');

    // Steps: LIST -> CREATE -> WAITING
    const [step, setStep] = useState<'LIST' | 'CREATE' | 'WAITING'>('LIST');
    const [activeJobId, setActiveJobId] = useState<string | null>(null);

    // Location Logic
    const [userLocation, setUserLocation] = useState<string>('');
    const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [isLocating, setIsLocating] = useState(false);
    const [isEditingLocation, setIsEditingLocation] = useState(false);
    const [editedLocation, setEditedLocation] = useState('');

    useEffect(() => {
        // Check for saved preferred location first
        const savedLocation = localStorage.getItem('preferredLocation');
        if (savedLocation) {
            setUserLocation(savedLocation);
            return;
        }

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
                    partsExpectedAtBooking: details.partsExpectedAtBooking
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

    const handleCancelJob = async (jobId?: string) => {
        const targetId = jobId || activeJobId;
        if (!targetId) return;
        const confirmed = window.confirm('Cancel this job?');
        if (!confirmed) return;
        await fetch(`/api/jobs/${targetId}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'CANCELLED_FREE' })
        });
        if (!jobId) {
            setStep('LIST');
        }
        mutate();
    };

    const [disputeDialog, setDisputeDialog] = useState<{ open: boolean; jobId?: string; reason: string; notes?: string }>({ open: false, reason: '', notes: '' });
    const [isSubmittingDispute, setIsSubmittingDispute] = useState(false);

    const submitDispute = async () => {
        if (!disputeDialog.jobId || !disputeDialog.reason.trim()) return;
        setIsSubmittingDispute(true);
        try {
            await fetch(`/api/jobs/${disputeDialog.jobId}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'DISPUTED',
                    reason: disputeDialog.reason,
                    disputeNotes: disputeDialog.notes
                })
            });
            setDisputeDialog({ open: false, reason: '', notes: '' });
            alert('Issue reported. Support will review this job.');
            mutate();
        } catch (e) {
            console.error('Dispute error', e);
            alert('Failed to report issue');
        } finally {
            setIsSubmittingDispute(false);
        }
    };

    // Review state
    const [reviewDialog, setReviewDialog] = useState<{ open: boolean; jobId?: string }>({ open: false });
    const [reviewRating, setReviewRating] = useState(5);
    const [reviewComment, setReviewComment] = useState('');
    const [isSubmittingReview, setIsSubmittingReview] = useState(false);

    // Track dismissed review prompts locally to prevent loops
    const [dismissedJobIds, setDismissedJobIds] = useState<string[]>([]);

    // Check for completed jobs without reviews and show prompt
    useEffect(() => {
        // Ensure jobs is an array before calling find
        if (!Array.isArray(jobs)) return;

        const completedJob = jobs.find((j: any) =>
            j.status === 'COMPLETED' &&
            !j.customerReview &&
            !reviewDialog.open &&
            !dismissedJobIds.includes(j.id)
        );
        if (completedJob) {
            // Show review prompt after a short delay (non-blocking)
            const timer = setTimeout(() => {
                setReviewDialog({ open: true, jobId: completedJob.id });
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [jobs, reviewDialog.open, dismissedJobIds]);

    const submitReview = async () => {
        if (!reviewDialog.jobId) return;
        setIsSubmittingReview(true);
        try {
            await fetch('/api/reviews/customer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jobId: reviewDialog.jobId,
                    rating: reviewRating,
                    comment: reviewComment
                })
            });
            // Add to dismissed list so it doesn't pop up again before revalidation
            setDismissedJobIds(prev => [...prev, reviewDialog.jobId!]);
            setReviewDialog({ open: false });
            setReviewRating(5);
            setReviewComment('');
            mutate();
        } catch (e) {
            console.error('Review submission error', e);
            alert('Failed to submit review');
        } finally {
            setIsSubmittingReview(false);
        }
    };

    const handleLogout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.push('/login');
    };

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

    // Filter jobs for Status and History tabs
    const activeJobs = Array.isArray(jobs) ? jobs.filter((j: any) =>
        !['COMPLETED', 'CLOSED', 'PAID', 'CANCELLED_FREE', 'CANCELLED_CHARGED'].includes(j.status)
    ) : [];

    const historyJobs = Array.isArray(jobs) ? jobs.filter((j: any) =>
        ['COMPLETED', 'CLOSED', 'PAID', 'CANCELLED_FREE', 'CANCELLED_CHARGED'].includes(j.status)
    ) : [];

    // Render job card helper
    const renderJobCard = (job: any) => (
        <Card key={job.id} className="overflow-hidden">
            <div className="p-6">
                <div className="flex justify-between items-start mb-2 gap-4">
                    <div className="space-y-1">
                        <div className="flex gap-2 mb-2">
                            <Badge variant={
                                ['COMPLETED', 'CLOSED'].includes(job.status) ? 'default' :
                                    ['CANCELLED_FREE', 'CANCELLED_CHARGED'].includes(job.status) ? 'destructive' :
                                        job.status === 'DISPATCHED' && !job.providerId ? 'secondary' :
                                            ['ACCEPTED', 'IN_PROGRESS'].includes(job.status) ? 'default' : 'secondary'
                            }>
                                {getCustomerStatus(job)}
                            </Badge>
                            {job.status === 'DISPUTED' && (
                                <Badge variant="destructive">Under Review</Badge>
                            )}
                        </div>
                        <h3 className="font-bold text-lg text-foreground">{job.category}</h3>
                        <p className="font-medium text-foreground/80">{job.description}</p>
                    </div>
                    <div className="text-right">
                        <div className="font-bold text-lg text-foreground">£{job.fixedPrice}</div>
                        <div className="text-sm text-gray-400">{job.isASAP ? 'ASAP' : new Date(job.scheduledAt).toLocaleString()}</div>

                        {!['CANCELLED_FREE', 'CANCELLED_CHARGED', 'CLOSED', 'COMPLETED', 'DISPUTED'].includes(job.status) && (
                            <div className="mt-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-red-600 border-red-200 hover:bg-red-50"
                                    onClick={() => handleCancelJob(job.id)}
                                >
                                    Cancel order
                                </Button>
                            </div>
                        )}

                        {(job.status === 'COMPLETED' || job.status === 'CUSTOMER_REVIEWED') && (
                            <div className="mt-2 text-right space-y-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-amber-600 border-amber-200 hover:bg-amber-50"
                                    onClick={() => setDisputeDialog({ open: true, jobId: job.id, reason: '', notes: '' })}
                                >
                                    Report Issue
                                </Button>
                                {!job.customerReview && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="block ml-auto text-blue-600"
                                        onClick={() => setReviewDialog({ open: true, jobId: job.id })}
                                    >
                                        Review Service
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="mt-4 pt-4 border-t border-white/10 flex flex-col md:flex-row justify-between text-sm gap-4">
                    <div className="flex flex-col gap-1">
                        <span className="text-gray-400">Location</span>
                        <span className="font-medium">{job.location}</span>
                    </div>

                    {job.provider && (
                        <div className="bg-white/5 border-white/10 rounded-lg flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                                {job.provider.name.charAt(0)}
                            </div>
                            <div>
                                <div className="font-semibold text-white flex items-center gap-2">
                                    {job.provider.name}
                                    {(job.provider.complianceConfirmed) && (
                                        <span className="text-green-600 text-xs bg-green-100 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                                            ✓ Verified
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-blue-700">
                                    {job.provider.providerType || 'Service Provider'}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {job.completionNotes && (
                    <div className="mt-3 bg-white/5 rounded-lg text-sm text-gray-300">
                        <span className="font-semibold text-gray-700">Completion Notes: </span>
                        <span className="text-gray-400">{job.completionNotes}</span>
                    </div>
                )}

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
    );

    // Render content based on active tab
    const renderContent = () => {
        // Handle WAITING state (dispatch timer)
        if (step === 'WAITING' && activeJobId) {
            return (
                <DispatchTimer
                    jobId={activeJobId}
                    onCompleted={() => {
                        setStep('LIST');
                        setActiveTab('STATUS');
                    }}
                    onCancel={() => handleCancelJob()}
                />
            );
        }

        switch (activeTab) {
            case 'NEW_TASK':
                return (
                    <div className="space-y-4">
                        <JobCreationForm
                            onSubmit={handleCreateJob}
                            onCancel={() => setActiveTab('STATUS')}
                            loading={false}
                            defaultLocation={userLocation}
                        />
                    </div>
                );

            case 'STATUS':
                return (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h2 className="text-2xl font-bold text-white">Active Jobs</h2>
                            <Button onClick={() => setActiveTab('NEW_TASK')} className="gap-2">
                                <Plus className="w-4 h-4" /> New Request
                            </Button>
                        </div>

                        {!jobs ? (
                            <p className="text-center py-8 text-gray-400">Loading jobs...</p>
                        ) : activeJobs.length === 0 ? (
                            <div className="text-center py-12 bg-white/5 border-white/10 rounded-lg text-gray-400">
                                No active jobs. Start a new request!
                            </div>
                        ) : (
                            <div className="grid gap-4">
                                {activeJobs.map(renderJobCard)}
                            </div>
                        )}
                    </div>
                );

            case 'HISTORY':
                return (
                    <div className="space-y-4">
                        <h2 className="text-2xl font-bold text-white">Job History</h2>

                        {!jobs ? (
                            <p className="text-center py-8 text-gray-400">Loading jobs...</p>
                        ) : historyJobs.length === 0 ? (
                            <div className="text-center py-12 bg-white/5 border-white/10 rounded-lg text-gray-400">
                                No past jobs yet.
                            </div>
                        ) : (
                            <div className="grid gap-4">
                                {historyJobs.map(renderJobCard)}
                            </div>
                        )}
                    </div>
                );

            case 'ACCOUNT':
                return (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-bold text-white">Account</h2>

                        <Card>
                            <CardContent className="p-6 space-y-6">
                                <div className="flex items-center gap-4">
                                    <div className="h-16 w-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-bold">
                                        {user.name?.charAt(0) || 'U'}
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-semibold text-white">{user.name}</h3>
                                        <p className="text-sm text-gray-400">{user.email}</p>
                                        <p className="text-xs text-gray-500 uppercase mt-1">{user.role}</p>
                                    </div>
                                </div>

                                <div className="border-t border-white/10 pt-4">
                                    <h4 className="font-semibold text-white mb-2">Account Information</h4>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-gray-400">Member since</span>
                                            <span className="text-white">{new Date(user.createdAt).toLocaleDateString()}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-400">Total jobs</span>
                                            <span className="text-white">{jobs?.length || 0}</span>
                                        </div>
                                    </div>
                                </div>

                                <Button
                                    onClick={handleLogout}
                                    variant="destructive"
                                    className="w-full gap-2"
                                >
                                    <LogOut className="w-4 h-4" />
                                    Log Out
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                );

            default:
                return null;
        }
    };

    const handleSaveLocation = () => {
        if (editedLocation.trim()) {
            setUserLocation(editedLocation);
            localStorage.setItem('preferredLocation', editedLocation);
            setIsEditingLocation(false);
        }
    };

    const handleCancelEdit = () => {
        setIsEditingLocation(false);
        setEditedLocation('');
    };

    return (
        <div className="pb-20">
            {/* Header Bar with Editable Location */}
            {userLocation && (
                <div className="mb-6 flex items-center gap-3">
                    {!isEditingLocation ? (
                        <>
                            <div className="bg-zinc-900 border border-white/10 rounded-lg px-4 py-2 flex items-center gap-2 cursor-pointer hover:border-blue-500/50 transition-colors" onClick={() => {
                                setIsEditingLocation(true);
                                setEditedLocation(userLocation);
                            }}>
                                <MapPin className="w-4 h-4 text-blue-500" />
                                <div>
                                    <p className="text-xs text-gray-400">Current Location</p>
                                    <p className="text-sm text-white font-medium">{userLocation}</p>
                                </div>
                                <Edit2 className="w-3 h-3 text-gray-500 ml-2" />
                            </div>
                            <div className="flex items-center gap-2 text-gray-400">
                                <ArrowLeft className="w-4 h-4" />
                                <span className="text-sm">Change location</span>
                            </div>
                        </>
                    ) : (
                        <div className="bg-zinc-900 border border-blue-500/50 rounded-lg px-4 py-2 flex items-center gap-2 flex-1">
                            <MapPin className="w-4 h-4 text-blue-500" />
                            <div className="flex-1">
                                <p className="text-xs text-gray-400 mb-1">Edit Location</p>
                                <Input
                                    value={editedLocation}
                                    onChange={(e) => setEditedLocation(e.target.value)}
                                    placeholder="e.g. 221B Baker Street, London"
                                    className="bg-zinc-800 border-white/10 text-white h-8"
                                    autoFocus
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveLocation();
                                        if (e.key === 'Escape') handleCancelEdit();
                                    }}
                                />
                            </div>
                            <div className="flex gap-1">
                                <Button size="sm" variant="ghost" onClick={handleSaveLocation} className="h-8 w-8 p-0 text-green-500 hover:text-green-400">
                                    <Check className="w-4 h-4" />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={handleCancelEdit} className="h-8 w-8 p-0 text-red-500 hover:text-red-400">
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {renderContent()}

            {/* Bottom Navigation */}
            <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />

            {/* Review Dialog */}
            {reviewDialog.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-zinc-900 border-white/10 p-6 rounded-lg max-w-md w-full mx-4">
                        <div className="space-y-1 mb-4">
                            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                <Star className="w-5 h-5 text-yellow-500" />
                                Rate Your Experience
                            </h3>
                            <p className="text-sm text-gray-400">How was the service? This helps us improve.</p>
                        </div>

                        <div className="space-y-2 mb-4">
                            <Label>Rating</Label>
                            <div className="flex gap-2">
                                {[1, 2, 3, 4, 5].map((rating) => (
                                    <button
                                        key={rating}
                                        type="button"
                                        onClick={() => setReviewRating(rating)}
                                        className={`flex-1 p-2 rounded-md border-2 transition-colors ${reviewRating >= rating
                                            ? 'border-yellow-400 bg-yellow-50 text-yellow-600'
                                            : 'border-gray-200 text-gray-400 hover:border-gray-300'
                                            }`}
                                    >
                                        <Star className={`w-5 h-5 mx-auto ${reviewRating >= rating ? 'fill-current' : ''}`} />
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2 mb-4">
                            <Label>Comment (Optional)</Label>
                            <textarea
                                className="w-full rounded-md border border-white/10 bg-zinc-800 text-white placeholder:text-gray-600 focus:border-blue-500 p-2"
                                rows={3}
                                placeholder="Share your experience..."
                                value={reviewComment}
                                onChange={(e) => setReviewComment(e.target.value)}
                            />
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                            <Button
                                variant="ghost"
                                onClick={() => {
                                    if (reviewDialog.jobId) {
                                        setDismissedJobIds(prev => [...prev, reviewDialog.jobId!]);
                                    }
                                    setReviewDialog({ open: false });
                                    setReviewRating(5);
                                    setReviewComment('');
                                }}
                                disabled={isSubmittingReview}
                            >
                                Skip
                            </Button>
                            <Button
                                variant="default"
                                onClick={submitReview}
                                disabled={isSubmittingReview}
                            >
                                {isSubmittingReview ? 'Submitting...' : 'Submit Review'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Dispute Dialog */}
            {disputeDialog.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-zinc-900 border-white/10 text-white p-6 rounded-lg max-w-md w-full mx-4">
                        <div className="space-y-1 mb-4">
                            <h3 className="text-lg font-semibold text-red-600 flex items-center gap-2">
                                Report an Issue
                            </h3>
                            <p className="text-sm text-gray-400">Please describe the problem with this job. Payments will be paused.</p>
                        </div>

                        <div className="space-y-2 mb-4">
                            <Label>What went wrong? *</Label>
                            <select
                                className="w-full rounded-md border border-white/10 bg-zinc-800 text-white placeholder:text-gray-600 focus:border-red-500 p-2"
                                value={disputeDialog.reason}
                                onChange={(e) => setDisputeDialog(prev => ({ ...prev, reason: e.target.value }))}
                            >
                                <option value="">Select a reason...</option>
                                <option value="Incomplete work">Incomplete work</option>
                                <option value="Poor quality">Poor quality</option>
                                <option value="Damage caused">Damage caused</option>
                                <option value="Unprofessional behaviour">Unprofessional behaviour</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>

                        <div className="space-y-2 mb-4">
                            <Label>Additional Details</Label>
                            <textarea
                                className="w-full rounded-md border border-white/10 bg-zinc-800 text-white placeholder:text-gray-600 focus:border-red-500 p-2"
                                rows={4}
                                placeholder="Please provide more details..."
                                value={disputeDialog.notes}
                                onChange={(e) => setDisputeDialog(prev => ({ ...prev, notes: e.target.value }))}
                            />
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                            <Button
                                variant="outline"
                                onClick={() => setDisputeDialog({ open: false, reason: '', notes: '' })}
                                disabled={isSubmittingDispute}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={submitDispute}
                                disabled={isSubmittingDispute || !disputeDialog.reason}
                            >
                                {isSubmittingDispute ? 'Reporting...' : 'Report Issue'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
