'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { JobCreationForm } from './JobCreationForm';
import { DispatchTimer } from './DispatchTimer';
import { ProviderMap } from './ProviderMap';
import { Plus, MapPin, Star } from 'lucide-react';
import { CustomerGreeting } from './CustomerGreeting';

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
        await fetch(`/api/jobs/${targetId}/cancel`, { method: 'POST' });
        if (!jobId) {
            setStep('LIST');
        }
        mutate();
    };

    // Review state
    const [reviewDialog, setReviewDialog] = useState<{ open: boolean; jobId?: string }>({ open: false });
    const [reviewRating, setReviewRating] = useState(5);
    const [reviewComment, setReviewComment] = useState('');
    const [isSubmittingReview, setIsSubmittingReview] = useState(false);

    // Check for completed jobs without reviews and show prompt
    useEffect(() => {
        // Ensure jobs is an array before calling find
        if (!Array.isArray(jobs)) return;
        
        const completedJob = jobs.find((j: any) => 
            j.status === 'COMPLETED' && 
            !j.customerReview &&
            !reviewDialog.open
        );
        if (completedJob) {
            // Show review prompt after a short delay (non-blocking)
            const timer = setTimeout(() => {
                setReviewDialog({ open: true, jobId: completedJob.id });
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [jobs, reviewDialog.open]);

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
                onCancel={() => handleCancelJob()}
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

            {!jobs ? (
                <p className="text-center py-8 text-gray-500">Loading jobs...</p>
            ) : !Array.isArray(jobs) ? (
                <div className="text-center py-12 bg-red-50 rounded-lg border border-red-200 text-red-600">
                    <p className="font-semibold">Error loading jobs</p>
                    <p className="text-sm mt-1">Please refresh the page or try again later.</p>
                </div>
            ) : jobs.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed text-gray-400">
                    No active jobs. Start a new request!
                </div>
            ) : (
                <div className="grid gap-4">
                    {jobs.map((job: any) => (
                        <Card key={job.id} className="overflow-hidden">
                            <div className="p-6">
                                <div className="flex justify-between items-start mb-2 gap-4">
                                    <div className="space-y-1">
                                        <Badge variant={
                                            ['COMPLETED', 'CLOSED'].includes(job.status) ? 'default' :
                                                ['CANCELLED_FREE', 'CANCELLED_CHARGED'].includes(job.status) ? 'destructive' :
                                                job.status === 'DISPATCHED' && !job.providerId ? 'secondary' :
                                                ['ACCEPTED', 'IN_PROGRESS'].includes(job.status) ? 'default' : 'secondary'
                                        } className="mb-2">
                                            {getCustomerStatus(job)}
                                        </Badge>
                                        <h3 className="font-bold text-lg text-gray-900">{job.category}</h3>
                                        <p className="font-medium text-gray-800">{job.description}</p>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-bold text-lg text-gray-900">£{job.fixedPrice}</div>
                                        <div className="text-sm text-gray-500">{job.isASAP ? 'ASAP' : new Date(job.scheduledAt).toLocaleString()}</div>
                                        {!['CANCELLED_FREE', 'CANCELLED_CHARGED', 'CLOSED'].includes(job.status) && (
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
                                    </div>
                                </div>
                                <div className="mt-4 pt-4 border-t flex justify-between text-sm text-gray-500">
                                    <span>{job.location}</span>
                                    {job.provider && <span className="text-blue-600 font-medium">Pro: {job.provider.name}</span>}
                                </div>
                                {['CANCELLED_FREE', 'CANCELLED_CHARGED'].includes(job.status) && job.cancellationReason && (
                                    <div className="mt-2 text-sm text-red-600">
                                        Cancel reason: {job.cancellationReason}
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
                    ))}
                </div>
            )}

            {/* Review Dialog */}
            {reviewDialog.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
                        <div className="space-y-1">
                            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                <Star className="w-5 h-5 text-yellow-500" />
                                Rate Your Experience
                            </h3>
                            <p className="text-sm text-gray-600">How was your service? (Optional)</p>
                        </div>

                        <div className="space-y-2">
                            <Label>Rating</Label>
                            <div className="flex gap-2">
                                {[1, 2, 3, 4, 5].map((rating) => (
                                    <button
                                        key={rating}
                                        type="button"
                                        onClick={() => setReviewRating(rating)}
                                        className={`flex-1 p-2 rounded-md border-2 transition-colors ${
                                            reviewRating >= rating
                                                ? 'border-yellow-400 bg-yellow-50 text-yellow-600'
                                                : 'border-gray-200 text-gray-400 hover:border-gray-300'
                                        }`}
                                    >
                                        <Star className={`w-5 h-5 mx-auto ${reviewRating >= rating ? 'fill-current' : ''}`} />
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Comment (Optional)</Label>
                            <textarea
                                className="w-full rounded-md border border-gray-200 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
        </div>
    );
}
