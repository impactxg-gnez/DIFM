'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { DispatchTimer } from './DispatchTimer';
import { ProviderMap } from './ProviderMap';
import { Plus, Star, LogOut, ArrowLeft, MapPin } from 'lucide-react';
import { BottomNav } from './BottomNav';
import { LocationPicker } from './LocationPicker';
import { HomeSearchInterface } from './HomeSearchInterface';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function getCustomerStatus(job: any): string {
    if (job.status === 'DISPATCHED' && !job.providerId) {
        return 'Looking for provider';
    }
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

    const [activeTab, setActiveTab] = useState<'NEW_TASK' | 'STATUS' | 'HISTORY' | 'ACCOUNT'>('NEW_TASK');
    const [step, setStep] = useState<'LIST' | 'CREATE' | 'WAITING'>('LIST');
    const [activeJobId, setActiveJobId] = useState<string | null>(null);

    // Location Logic
    const [userLocation, setUserLocation] = useState<string>('');
    const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [isLocating, setIsLocating] = useState(false);
    const [showLocationPicker, setShowLocationPicker] = useState(false);

    // Initial Load & Pending Job Check
    useEffect(() => {
        // 1. Location
        const savedLocation = localStorage.getItem('preferredLocation');
        if (savedLocation) {
            setUserLocation(savedLocation);
        } else if (navigator.geolocation && !userLocation) {
            setIsLocating(true);
            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    const { latitude, longitude } = position.coords;
                    setUserCoords({ lat: latitude, lng: longitude });
                    try {
                        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
                        if (res.ok) {
                            const data = await res.json();
                            const address = data.display_name.split(',').slice(0, 3).join(', ');
                            setUserLocation(address);
                        }
                    } catch (e) {
                        setUserLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
                    } finally {
                        setIsLocating(false);
                    }
                },
                (error) => setIsLocating(false)
            );
        }

        // 2. Check Pending Job from Landing Page
        const pendingJobStr = localStorage.getItem('pendingJob');
        if (pendingJobStr) {
            try {
                const pendingJob = JSON.parse(pendingJobStr);
                // Clear it so we don't duplicate
                localStorage.removeItem('pendingJob');

                // Create the job immediately
                createPendingJob(pendingJob);
            } catch (e) {
                console.error("Failed to parse pending job", e);
            }
        }
    }, []);

    const createPendingJob = async (jobData: any) => {
        handleCreateJob({
            description: jobData.description,
            location: jobData.address || userLocation || 'Unknown Location',
            category: 'HANDYMAN', // Default or derive
            price: jobData.pricePrediction?.totalPrice || 0
        });
    };

    const handleCreateJob = async (details: any) => {
        try {
            const res = await fetch('/api/jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...details,
                    latitude: userCoords?.lat || 51.5074, // Default to London if missing for now
                    longitude: userCoords?.lng || -0.1278,
                }),
            });
            if (res.ok) {
                const job = await res.json();
                setActiveJobId(job.id);
                setStep('WAITING');
                setActiveTab('STATUS'); // Switch to status tab
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

        setStep('LIST');
        setActiveJobId(null);
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
    const [dismissedJobIds, setDismissedJobIds] = useState<string[]>([]);

    useEffect(() => {
        if (!Array.isArray(jobs)) return;
        const completedJob = jobs.find((j: any) =>
            j.status === 'COMPLETED' && !j.customerReview && !reviewDialog.open && !dismissedJobIds.includes(j.id) && j.description
        );
        if (completedJob) {
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
            setDismissedJobIds(prev => [...prev, reviewDialog.jobId!]);
            setReviewDialog({ open: false });
            setReviewRating(5);
            setReviewComment('');
            mutate();
        } catch (e) {
            console.error('Review submission error', e);
        } finally {
            setIsSubmittingReview(false);
        }
    };

    const handleLogout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.push('/login');
    };

    const activeJobs = Array.isArray(jobs) ? jobs.filter((j: any) =>
        !['COMPLETED', 'CLOSED', 'PAID', 'CANCELLED_FREE', 'CANCELLED_CHARGED'].includes(j.status)
    ) : [];

    const historyJobs = Array.isArray(jobs) ? jobs.filter((j: any) =>
        ['COMPLETED', 'CLOSED', 'PAID', 'CANCELLED_FREE', 'CANCELLED_CHARGED'].includes(j.status)
    ) : [];

    const renderJobCard = (job: any) => (
        <Card key={job.id} className="overflow-hidden bg-[#1E1E20] border-white/10 text-white">
            <div className="p-6">
                <div className="flex justify-between items-start mb-2 gap-4">
                    <div className="space-y-1">
                        <div className="flex gap-2 mb-2">
                            <Badge variant={['COMPLETED', 'CLOSED'].includes(job.status) ? 'default' : 'secondary'}>
                                {getCustomerStatus(job)}
                            </Badge>
                        </div>
                        <h3 className="font-bold text-lg">{job.category}</h3>
                        <p className="font-medium text-white/80">{job.description}</p>
                    </div>
                    <div className="text-right">
                        <div className="font-bold text-lg">£{job.fixedPrice}</div>
                        <div className="text-sm text-gray-400">{job.isASAP ? 'ASAP' : new Date(job.scheduledAt).toLocaleString()}</div>
                        {!['CANCELLED_FREE', 'CANCELLED_CHARGED', 'CLOSED', 'COMPLETED', 'DISPUTED'].includes(job.status) && (
                            <Button size="sm" variant="outline" className="mt-2 text-red-400 border-red-900/50 hover:bg-red-900/20" onClick={() => handleCancelJob(job.id)}>
                                Cancel
                            </Button>
                        )}
                        {(job.status === 'COMPLETED' || job.status === 'CUSTOMER_REVIEWED') && !job.customerReview && (
                            <Button size="sm" variant="ghost" className="mt-2 text-blue-400" onClick={() => setReviewDialog({ open: true, jobId: job.id })}>
                                Review Service
                            </Button>
                        )}
                    </div>
                </div>
                {/* Provider Info */}
                {job.provider && (
                    <div className="mt-4 pt-4 border-t border-white/10 flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-blue-600/20 flex items-center justify-center text-blue-500 font-bold">
                            {job.provider.name.charAt(0)}
                        </div>
                        <div>
                            <div className="font-semibold">{job.provider.name}</div>
                            <div className="text-xs text-blue-400">Verified Pro</div>
                        </div>
                    </div>
                )}
            </div>
        </Card>
    );

    const renderContent = () => {
        // If we in active job "finding" state
        if (step === 'WAITING' && activeJobId && activeTab === 'STATUS') {
            return (
                <DispatchTimer
                    jobId={activeJobId}
                    onCompleted={() => {
                        setStep('LIST');
                        mutate();
                    }}
                    onCancel={() => handleCancelJob()}
                />
            );
        }

        switch (activeTab) {
            case 'NEW_TASK':
                return (
                    <div className="-mt-[100px]">
                        <HomeSearchInterface
                            onBookNow={(data) => handleCreateJob({
                                description: data.description,
                                location: data.address || userLocation || 'Unknown',
                                category: 'HANDYMAN',
                                price: data.pricePrediction?.totalPrice || 0
                            })}
                            initialLocation={userLocation}
                        />
                    </div>
                );

            case 'STATUS':
                return (
                    <div className="space-y-4 pt-8 px-6 text-white pb-24">
                        <h2 className="text-2xl font-bold">Active Jobs</h2>
                        {activeJobs.length === 0 ? (
                            <div className="text-center py-12 bg-white/5 border-white/10 rounded-lg text-gray-400">
                                No active jobs.
                            </div>
                        ) : (
                            <div className="grid gap-4">{activeJobs.map(renderJobCard)}</div>
                        )}
                    </div>
                );

            case 'HISTORY':
                return (
                    <div className="space-y-4 pt-8 px-6 text-white pb-24">
                        <h2 className="text-2xl font-bold">Job History</h2>
                        {historyJobs.length === 0 ? (
                            <div className="text-center py-12 bg-white/5 border-white/10 rounded-lg text-gray-400">
                                No past jobs.
                            </div>
                        ) : (
                            <div className="grid gap-4">{historyJobs.map(renderJobCard)}</div>
                        )}
                    </div>
                );

            case 'ACCOUNT':
                return (
                    <div className="space-y-6 pt-8 px-6 text-white pb-24">
                        <h2 className="text-2xl font-bold">Account</h2>
                        <Card className="bg-[#1E1E20] border-white/10 text-white">
                            <CardContent className="p-6 space-y-6">
                                <div className="flex items-center gap-4">
                                    <div className="h-16 w-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-bold">
                                        {user.name?.charAt(0) || 'U'}
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-semibold">{user.name}</h3>
                                        <p className="text-sm text-gray-400">{user.email}</p>
                                    </div>
                                </div>
                                <Button onClick={handleLogout} variant="destructive" className="w-full gap-2">
                                    <LogOut className="w-4 h-4" /> Log Out
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                );
            default: return null;
        }
    };

    return (
        <div className="pb-20 min-h-screen">
            {/* We want the background on the dashboard too */}
            <div className="fixed inset-0 bg-cover bg-center z-[-1]" style={{ backgroundImage: 'url(/home-bg.jpg)' }} />
            <div className="fixed inset-0 bg-black/60 z-[-1]" />

            {renderContent()}

            <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />

            {reviewDialog.open && (() => {
                const jobToReview = jobs?.find((j: any) => j.id === reviewDialog.jobId);
                if (!jobToReview) return null;

                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                        <div className="bg-zinc-900 border border-white/10 p-6 rounded-lg max-w-md w-full mx-4">
                            <div className="space-y-1 mb-4">
                                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                    <Star className="w-5 h-5 text-yellow-500" />
                                    Rate Your Experience
                                </h3>
                                <p className="text-sm text-gray-400">How was the service? This helps us improve.</p>
                            </div>
                            <div className="space-y-2 mb-4">
                                <Label className="text-white">Rating</Label>
                                <div className="flex gap-2">
                                    {[1, 2, 3, 4, 5].map((rating) => (
                                        <button
                                            key={rating}
                                            type="button"
                                            onClick={() => setReviewRating(rating)}
                                            className={`flex-1 p-2 rounded-md border-2 transition-colors ${reviewRating >= rating
                                                ? 'border-yellow-400 bg-yellow-50 text-yellow-600'
                                                : 'border-white/10 text-gray-400 hover:border-gray-500'
                                                }`}
                                        >
                                            <Star className={`w-5 h-5 mx-auto ${reviewRating >= rating ? 'fill-current' : ''}`} />
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-2 mb-4">
                                <Label className="text-white">Comment (Optional)</Label>
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
                                    className="text-white hover:bg-white/10"
                                    onClick={() => {
                                        if (reviewDialog.jobId) {
                                            setDismissedJobIds(prev => [...prev, reviewDialog.jobId!]);
                                        }
                                        setReviewDialog({ open: false });
                                    }}
                                >
                                    Skip
                                </Button>
                                <Button onClick={submitReview}>Submit Review</Button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {disputeDialog.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-zinc-900 border-white/10 text-white p-6 rounded-lg max-w-md w-full mx-4">
                        <h3 className="text-lg font-semibold text-red-500 mb-4">Report Issue</h3>
                        <div className="space-y-2 mb-4">
                            <Label>Reason</Label>
                            <select
                                className="w-full rounded-md border border-white/10 bg-zinc-800 text-white p-2"
                                value={disputeDialog.reason}
                                onChange={(e) => setDisputeDialog(prev => ({ ...prev, reason: e.target.value }))}
                            >
                                <option value="">Select a reason...</option>
                                <option value="Incomplete work">Incomplete work</option>
                                <option value="Poor quality">Poor quality</option>
                            </select>
                        </div>
                        <div className="flex justify-end gap-3">
                            <Button variant="ghost" onClick={() => setDisputeDialog({ open: false, reason: '', notes: '' })}>Cancel</Button>
                            <Button variant="destructive" onClick={submitDispute}>Report</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
