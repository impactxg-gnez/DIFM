'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ScopeLock } from '@/components/booking/ScopeLock';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { DispatchTimer } from './DispatchTimer';
import { ProviderMap } from './ProviderMap';
import { Plus, Star, LogOut, ArrowLeft, MapPin } from 'lucide-react';
import { BottomNav } from './BottomNav';
import { LocationPicker } from './LocationPicker';
import { HomeSearchInterface } from './HomeSearchInterface';
import { VisitCard, type Visit } from '@/components/booking/VisitCard';
import { TotalPrice } from '@/components/booking/TotalPrice';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function getCustomerStatus(job: any): string {
    if (job.status === 'DISPATCHED' && !job.providerId) {
        return 'Looking for provider';
    }
    const statusMap: Record<string, string> = {
        'REQUESTED': 'Requesting price...',
        'PRICED': 'Price generated',
        'BOOKED': 'Booked',
        'ASSIGNING': 'Finding a pro...',
        'ASSIGNED': 'Pro found - Preparing...',
        'PREAUTHORISED': 'Card pre-authorised',
        'ARRIVING': 'Pro is on the way!',
        'IN_PROGRESS': 'Job in progress',
        'SCOPE_MISMATCH': 'Scope discrepancy found',
        'MISMATCH_PENDING': 'Action required: Scope mismatch',
        'REBOOK_REQUIRED': 'Awaiting re-booking',
        'PARTS_REQUIRED': 'Parts required',
        'COMPLETED': 'Job completed',
        'CAPTURED': 'Payment settled',
        'PAID_OUT': 'Provider paid',
        'CLOSED': 'Finished',
        'ISSUE_REPORTED': 'Issue reported',
        'CANCELLED_FREE': 'Cancelled',
        'CANCELLED_CHARGED': 'Cancelled (fee applied)',
        'DISPUTED': 'Disputed',
        'RESCHEDULE_REQUIRED': 'Awaiting Reschedule'
    };
    return statusMap[job.status] || job.status.replace('_', ' ');
}

export function CustomerView({ user }: { user: any }) {
    const router = useRouter();
    const { data: jobs, mutate } = useSWR('/api/jobs', fetcher, { refreshInterval: 5000 });

    const [activeTab, setActiveTab] = useState<'NEW_TASK' | 'STATUS' | 'HISTORY' | 'ACCOUNT'>('NEW_TASK');
    const [step, setStep] = useState<'LIST' | 'CREATE' | 'SCOPE_LOCK' | 'WAITING'>('LIST');
    // 🔒 Visit-first state (no job/price assumptions)
    const [visits, setVisits] = useState<Visit[]>([]);

    // Total price is derived from visits - always recalculates when visits change
    const totalPrice = useMemo(
        () => visits.reduce((sum, v) => sum + (v.price || 0), 0),
        [visits]
    );

    // Rescheduling State
    const [reschedulingJobId, setReschedulingJobId] = useState<string | null>(null);
    const [rescheduleTime, setRescheduleTime] = useState<string>('');
    const [isRescheduling, setIsRescheduling] = useState(false);

    // Issue Reporting State
    const [issueDialog, setIssueDialog] = useState<{ open: boolean; jobId?: string }>({ open: false });
    const [issueNotes, setIssueNotes] = useState('');
    const [issuePhotos, setIssuePhotos] = useState('');
    const [isSubmittingIssue, setIsSubmittingIssue] = useState(false);

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
        });
    };

    const handleCreateJob = async (details: any) => {
        try {
            const res = await fetch('/api/jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    description: details.description,
                    location: details.location,
                    latitude: userCoords?.lat || 51.5074, // Default to London if missing for now
                    longitude: userCoords?.lng || -0.1278,
                }),
            });
            if (res.ok) {
                const quote = await res.json();
                setVisits(Array.isArray(quote.visits) ? quote.visits : []);
                // totalPrice is now derived from visits, no need to set it
                setStep('SCOPE_LOCK');
                mutate();
            }
        } catch (e) {
            console.error("Job creation failed", e);
        }
    };

    const handleCancelJob = async (jobId?: string) => {
        const targetId = jobId;
        if (!targetId) return; // legacy path: cancel requires jobId from list, not quote
        const confirmed = window.confirm('Cancel this job?');
        if (!confirmed) return;

        await fetch(`/api/jobs/${targetId}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'CANCELLED_FREE' })
        });

        setStep('LIST');
        setVisits([]);
        // totalPrice is now derived from visits, no need to reset it
        mutate();
    };

    const handleRescheduleJob = async (jobId: string, scheduledAt: string) => {
        if (!scheduledAt) return;
        setIsRescheduling(true);
        try {
            await fetch(`/api/jobs/${jobId}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'BOOKED',
                    scheduledAt: new Date(scheduledAt).toISOString()
                })
            });
            setReschedulingJobId(null);
            setRescheduleTime('');
            mutate();
        } catch (e) {
            console.error('Failed to reschedule job', e);
        } finally {
            setIsRescheduling(false);
        }
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

    const handleUpgrade = async (jobId: string, visitId: string, currentTier: string) => {
        const tierOrder = ['H1', 'H2', 'H3'];
        const currentIndex = tierOrder.indexOf(currentTier);
        const nextTier = tierOrder[currentIndex + 1] || 'H3';

        if (currentIndex === 2) {
            alert('Already at maximum tier (H3). Please contact support.');
            return;
        }

        const confirmUpgrade = window.confirm(`Upgrade this visit to ${nextTier}? This will adjust the price and allow the pro to continue.`);
        if (!confirmUpgrade) return;

        try {
            const res = await fetch(`/api/jobs/${jobId}/mismatch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'UPGRADE',
                    visitId,
                    newTier: nextTier,
                    reason: 'Customer approved upgrade'
                })
            });
            if (res.ok) {
                mutate();
            }
        } catch (e) {
            console.error('Upgrade failed', e);
        }
    };

    const handleRebook = async (jobId: string, visitId: string) => {
        const confirmRebook = window.confirm('This will cancel the current visit and allow you to re-book. Proceed?');
        if (!confirmRebook) return;

        try {
            const res = await fetch(`/api/jobs/${jobId}/mismatch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'REBOOK',
                    visitId,
                    reason: 'Customer chose to rebook'
                })
            });
            if (res.ok) {
                mutate();
            }
        } catch (e) {
            console.error('Rebook failed', e);
        }
    };

    const handleRebookRequired = async (jobId: string) => {
        // Move from REBOOK_REQUIRED back to BOOKED
        try {
            await fetch(`/api/jobs/${jobId}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'BOOKED' })
            });
            mutate();
        } catch (e) {
            console.error('Failed to move to booked', e);
        }
    };

    const handleReportIssue = async () => {
        if (!issueDialog.jobId) return;
        if (!issueNotes.trim()) {
            alert('Please describe the issue');
            return;
        }

        setIsSubmittingIssue(true);
        try {
            const res = await fetch(`/api/jobs/${issueDialog.jobId}/issue`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    issueNotes,
                    issuePhotos: issuePhotos || null
                })
            });

            if (res.ok) {
                setIssueDialog({ open: false });
                setIssueNotes('');
                setIssuePhotos('');
                alert('Issue reported. Our team will review and contact you shortly.');
                mutate();
            } else {
                const err = await res.json();
                alert(`Failed to report issue: ${err.error || 'Server error'}`);
            }
        } catch (e) {
            console.error('Report issue error', e);
            alert('Failed to report issue');
        } finally {
            setIsSubmittingIssue(false);
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
        !['PAID_OUT', 'CLOSED', 'CANCELLED_FREE', 'CANCELLED_CHARGED'].includes(j.status)
    ) : [];

    const historyJobs = Array.isArray(jobs) ? jobs.filter((j: any) =>
        ['PAID_OUT', 'CLOSED', 'CANCELLED_FREE', 'CANCELLED_CHARGED'].includes(j.status)
    ) : [];

    const dbVisitToUiVisit = (v: any): Visit => {
        const required = Array.isArray(v.required_capability_tags_union) ? v.required_capability_tags_union : [];
        const visitTypeLabel =
            v.item_class === 'CLEANING' ? 'Cleaning' :
                v.item_class === 'SPECIALIST' ? (required.includes('PLUMBING') ? 'Plumbing' : required.includes('ELECTRICAL') ? 'Electrical' : 'Specialist') :
                    (required.includes('PLUMBING') ? 'Plumbing' : required.includes('ELECTRICAL') ? 'Electrical' : 'Handyman');

        return {
            visit_id: v.id,
            item_class: v.item_class,
            visit_type_label: visitTypeLabel,
            primary_job_item: {
                job_item_id: v.primary_job_item_id,
                display_name: v.primary_job_item_id,
                time_weight_minutes: v.base_minutes || 0,
            },
            addon_job_items: (v.addon_job_item_ids || []).map((id: string) => ({
                job_item_id: id,
                display_name: id,
                time_weight_minutes: 0,
            })),
            required_capability_tags: required,
            total_minutes: v.effective_minutes || v.base_minutes || 0,
            tier: v.tier,
            price: v.price || 0,
        };
    };

    const renderVisitListFromJobs = (jobsList: any[]) => {
        if (jobsList.length === 0) return null;

        return (
            <div className="space-y-12">
                {jobsList.map((job: any) => {
                    const jobVisits = (job.visits || []).map(dbVisitToUiVisit);
                    const isReschedule = job.status === 'RESCHEDULE_REQUIRED';

                    return (
                        <div key={job.id} className="space-y-6">
                            {/* 1️⃣ Job identification / Status indicator */}
                            <div className="flex items-center gap-2 px-2">
                                <Badge variant="outline" className="border-white/10 text-gray-400">
                                    Job Reference: {job.id.slice(0, 8)}
                                </Badge>
                                <Badge status={job.status}>
                                    {getCustomerStatus(job)}
                                </Badge>
                            </div>

                            {isReschedule ? (
                                <Card className="bg-amber-500/10 border-amber-500/20 text-white overflow-hidden">
                                    <CardContent className="p-6 space-y-4">
                                        <div className="flex items-start gap-3">
                                            <div className="p-2 bg-amber-500/20 rounded-full">
                                                <MapPin className="w-5 h-5 text-amber-500" />
                                            </div>
                                            <div className="space-y-1">
                                                <h3 className="text-lg font-bold text-amber-500">Reschedule Required</h3>
                                                <p className="text-sm text-gray-300">
                                                    We couldn’t find an available provider for your selected time.
                                                    Please choose a new time or cancel your booking.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-3 sm:flex-row pt-2">
                                            {reschedulingJobId === job.id ? (
                                                <div className="flex-1 space-y-3 p-3 bg-black/20 rounded-lg">
                                                    <Label className="text-xs uppercase tracking-wider text-gray-400">New Date & Time</Label>
                                                    <Input
                                                        type="datetime-local"
                                                        value={rescheduleTime}
                                                        onChange={(e) => setRescheduleTime(e.target.value)}
                                                        className="bg-zinc-800 border-white/10"
                                                    />
                                                    <div className="flex gap-2">
                                                        <Button
                                                            className="flex-1 bg-amber-600 hover:bg-amber-700"
                                                            onClick={() => handleRescheduleJob(job.id, rescheduleTime)}
                                                            disabled={isRescheduling || !rescheduleTime}
                                                        >
                                                            {isRescheduling ? 'Updating...' : 'Confirm New Time'}
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            onClick={() => setReschedulingJobId(null)}
                                                        >
                                                            Cancel
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <Button
                                                        className="flex-1 bg-amber-600 hover:bg-amber-700 font-bold"
                                                        onClick={() => setReschedulingJobId(job.id)}
                                                    >
                                                        Reschedule
                                                    </Button>
                                                    <Button
                                                        variant="destructive"
                                                        className="flex-1 font-bold"
                                                        onClick={() => handleCancelJob(job.id)}
                                                    >
                                                        Cancel Job
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex gap-2 mb-2 px-2">
                                        <Badge variant="secondary">Visits</Badge>
                                        <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20">
                                            {jobVisits.length} VisitCards
                                        </Badge>
                                    </div>
                                    <div className="grid gap-4">
                                        {jobVisits.map((v: Visit, idx: number) => (
                                            <div key={v.visit_id || `${job.id}-${idx}`} className="space-y-4">
                                                <VisitCard visit={v} index={idx} />

                                                {['MISMATCH_PENDING', 'SCOPE_MISMATCH'].includes(job.status) && (
                                                    <Card className="bg-red-500/10 border-red-500/20 p-4">
                                                        <div className="space-y-3">
                                                            <p className="text-sm font-medium text-red-400">
                                                                The provider reported that the job differs from the confirmed scope.
                                                                Please choose how you’d like to proceed.
                                                            </p>
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                                <Button
                                                                    className="bg-green-600 hover:bg-green-700 font-bold"
                                                                    onClick={() => handleUpgrade(job.id, v.visit_id, v.tier)}
                                                                >
                                                                    Upgrade Visit
                                                                </Button>
                                                                <Button
                                                                    variant="outline"
                                                                    className="border-red-500/50 text-red-500 hover:bg-red-500/10 font-bold"
                                                                    onClick={() => handleRebook(job.id, v.visit_id)}
                                                                >
                                                                    Rebook Correct Visit
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    </Card>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {job.status === 'REBOOK_REQUIRED' && (
                                        <Card className="bg-amber-500/10 border-amber-500/20 p-6 text-center space-y-4">
                                            <p className="text-sm text-amber-500 font-medium">
                                                This job requires re-booking. Click below to return to the booking screen.
                                            </p>
                                            <Button
                                                className="bg-amber-600 hover:bg-amber-700 w-full font-bold"
                                                onClick={() => handleRebookRequired(job.id)}
                                            >
                                                Start Re-booking
                                            </Button>
                                        </Card>
                                    )}

                                    {job.status === 'COMPLETED' && (
                                        <Card className="bg-blue-500/10 border-blue-500/20 p-6 text-center space-y-4">
                                            <p className="text-sm text-blue-400 font-medium">
                                                Job completed. If you experienced any issues, please let us know.
                                            </p>
                                            <Button
                                                className="bg-blue-600 hover:bg-blue-700 w-full font-bold"
                                                onClick={() => setIssueDialog({ open: true, jobId: job.id })}
                                            >
                                                Report Issue
                                            </Button>
                                        </Card>
                                    )}
                                </div>
                            )}

                            {/* Deterministic Price for THIS Job only */}
                            <TotalPrice amount={Number(job.fixedPrice || 0)} />
                            <div className="h-px bg-white/5 mx-4" /> {/* Separator between multiple jobs */}
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderContent = () => {
        if (step === 'SCOPE_LOCK' && visits.length > 0) {
            return (
                <ScopeLock
                    visits={visits}
                    onComplete={async (visitId, answers, scopePhotos) => {
                        try {
                            const res = await fetch(`/api/visits/${visitId}/scope-lock`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ answers, scope_photos: scopePhotos })
                            });
                            if (res.ok) {
                                const result = await res.json();
                                // Update the visit in local state with new tier/price from API response
                                setVisits(prevVisits =>
                                    prevVisits.map(v => {
                                        if (v.visit_id === visitId) {
                                            return {
                                                ...v,
                                                tier: result.tier,
                                                price: result.price,
                                                total_minutes: result.effective_minutes || v.total_minutes
                                            };
                                        }
                                        return v;
                                    })
                                );
                                // Refresh jobs data
                                mutate();
                                // After scope-lock, we can show "waiting" or return to status list.
                                setStep('WAITING');
                            }
                        } catch (e) {
                            console.error('Scope lock submission failed', e);
                        }
                    }}
                    onCancel={() => {
                        setStep('LIST');
                        setVisits([]);
                        // totalPrice is now derived from visits, no need to reset it
                    }}
                />
            );
        }

        if (step === 'WAITING') {
            return (
                <div className="pt-10 px-6 pb-24 text-white space-y-4">
                    <h2 className="text-2xl font-bold">Your Visits</h2>
                    <div className="space-y-3">
                        {visits.map((v, idx) => (
                            <VisitCard key={v.visit_id || `${v.primary_job_item.job_item_id}-${idx}`} visit={v} index={idx} />
                        ))}
                    </div>
                    <TotalPrice amount={totalPrice} />
                    <p className="text-sm text-gray-400">
                        Scope locked. We’re now finding the right pro(s) for each visit.
                    </p>
                    <Button variant="outline" onClick={() => { setStep('LIST'); setActiveTab('STATUS'); }}>
                        View status
                    </Button>
                </div>
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
                            renderVisitListFromJobs(activeJobs)
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
                            renderVisitListFromJobs(historyJobs)
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

            {issueDialog.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-zinc-900 border-white/10 text-white p-6 rounded-lg max-w-md w-full mx-4">
                        <h3 className="text-lg font-semibold text-blue-500 mb-4">Report Issue</h3>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>Issue Description *</Label>
                                <textarea
                                    className="w-full rounded-md border border-white/10 bg-zinc-800 text-white placeholder:text-gray-600 focus:border-blue-500 p-2"
                                    rows={4}
                                    placeholder="Please describe the issue you experienced..."
                                    value={issueNotes}
                                    onChange={(e) => setIssueNotes(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Photo Evidence (Optional)</Label>
                                <Input
                                    type="text"
                                    className="bg-zinc-800 border-white/10 text-white"
                                    placeholder="Photo URL (if available)"
                                    value={issuePhotos}
                                    onChange={(e) => setIssuePhotos(e.target.value)}
                                />
                                <p className="text-xs text-gray-400">You can provide a photo URL to help us understand the issue better.</p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 pt-4">
                            <Button
                                variant="ghost"
                                className="text-white hover:bg-white/10"
                                onClick={() => {
                                    setIssueDialog({ open: false });
                                    setIssueNotes('');
                                    setIssuePhotos('');
                                }}
                                disabled={isSubmittingIssue}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleReportIssue}
                                disabled={isSubmittingIssue}
                                className="bg-blue-600 hover:bg-blue-700"
                            >
                                {isSubmittingIssue ? 'Submitting...' : 'Submit Issue'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

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
