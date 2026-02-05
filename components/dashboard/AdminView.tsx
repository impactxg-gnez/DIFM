'use client';

import { useMemo, useState, useCallback } from 'react';
import useSWR from 'swr';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { SERVICE_CATEGORIES, PLATFORM_FEE_PERCENT } from '@/lib/constants';
import { getNextStates } from '@/lib/jobStateMachine';
import { MapPin, ShieldAlert, Sparkles, Users, Wallet, Sliders, RefreshCw, CreditCard, X, ChevronRight, AlertCircle, CheckCircle2 } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const tabs = [
    { id: 'jobs', label: 'Jobs', icon: ShieldAlert },
    { id: 'disputes', label: 'Disputes', icon: ShieldAlert },
    { id: 'providers', label: 'Providers', icon: Users },
    { id: 'payments', label: 'Payments', icon: CreditCard },
    { id: 'pricing', label: 'Pricing Rules', icon: Wallet },
    { id: 'categories', label: 'Categories', icon: Sliders },
];

export function AdminView({ user }: { user: any }) {
    const [activeTab, setActiveTab] = useState('jobs');
    const [cancelDialog, setCancelDialog] = useState<{ open: boolean; jobId?: string; status?: string; reason: string }>({ open: false, reason: '' });
    const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);
    const [overrideDialog, setOverrideDialog] = useState<{ open: boolean; jobId?: string; price?: number; reason: string }>({ open: false, reason: '' });
    const [isSubmittingOverride, setIsSubmittingOverride] = useState(false);
    const { data: jobs, mutate: mutateJobs } = useSWR('/api/jobs', fetcher, { refreshInterval: 5000 });
    const { data: disputes, mutate: mutateDisputes } = useSWR(activeTab === 'disputes' ? '/api/admin/disputes' : null, fetcher);
    const { data: providers, mutate: mutateProviders } = useSWR(activeTab === 'providers' ? '/api/admin/providers' : null, fetcher);
    const { data: paymentsData, mutate: mutatePayments } = useSWR(activeTab === 'payments' ? '/api/admin/payments' : null, fetcher);
    const { data: pricingRules, mutate: mutatePricing } = useSWR(activeTab === 'pricing' ? '/api/admin/pricing-rules' : null, fetcher);

    // Filters
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
    const [providerTypeFilter, setProviderTypeFilter] = useState<string>('ALL');
    const [dateFilter, setDateFilter] = useState<string>(''); // YYYY-MM-DD

    const [jobDetailDialog, setJobDetailDialog] = useState<{ open: boolean; job: any }>({ open: false, job: null });

    const filteredJobs = useMemo(() => {
        if (!jobs) return [];
        return jobs.filter((job: any) => {
            if (statusFilter !== 'ALL' && job.status !== statusFilter) return false;
            if (categoryFilter !== 'ALL' && job.category !== categoryFilter) return false;
            if (dateFilter) {
                const jobDate = new Date(job.createdAt).toISOString().split('T')[0];
                if (jobDate !== dateFilter) return false;
            }
            return true;
        });
    }, [jobs, statusFilter, categoryFilter, dateFilter]);

    const handleOverrideStatus = async (jobId: string, newStatus: string) => {
        if (newStatus.startsWith('CANCELLED')) {
            setCancelDialog({ open: true, jobId, status: newStatus, reason: '' });
            return;
        }
        if (!confirm(`Force set job ${jobId.slice(0, 6)} to ${newStatus}?`)) return;

        await fetch(`/api/jobs/${jobId}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        mutateJobs();
    };

    const submitCancelDialog = async () => {
        if (!cancelDialog.jobId || !cancelDialog.status) return;
        if (!cancelDialog.reason.trim()) {
            alert('Please enter a reason to cancel.');
            return;
        }
        setIsSubmittingCancel(true);
        await fetch(`/api/jobs/${cancelDialog.jobId}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: cancelDialog.status, reason: cancelDialog.reason })
        });
        setIsSubmittingCancel(false);
        setCancelDialog({ open: false, reason: '' });
        mutateJobs();
    };

    const closeCancelDialog = () => setCancelDialog({ open: false, reason: '' });

    const handleOverrideJob = async (jobId: string, price?: number, providerId?: string) => {
        if (price !== undefined) {
            setOverrideDialog({ open: true, jobId, price, reason: '' });
            return;
        }
        await fetch(`/api/jobs/${jobId}/override`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                providerId: providerId || undefined,
            })
        });
        mutateJobs();
    };

    const submitOverrideDialog = async () => {
        if (!overrideDialog.jobId || overrideDialog.price === undefined) return;
        if (!overrideDialog.reason.trim()) {
            alert('Please enter a reason to override price.');
            return;
        }
        setIsSubmittingOverride(true);
        try {
            const res = await fetch(`/api/jobs/${overrideDialog.jobId}/override`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fixedPrice: overrideDialog.price,
                    reason: overrideDialog.reason,
                })
            });

            if (!res.ok) {
                const error = await res.json();
                alert(`Failed to override price: ${error.error || 'Unknown error'}`);
                setIsSubmittingOverride(false);
                return;
            }

            setOverrideDialog({ open: false, reason: '' });
            mutateJobs();
            alert('Price overridden successfully!');
        } catch (error) {
            console.error('Override price error', error);
            alert('Failed to override price. Please try again.');
        } finally {
            setIsSubmittingOverride(false);
        }
    };

    const closeOverrideDialog = () => setOverrideDialog({ open: false, reason: '' });

    const handleUpdateRule = async (rule: any) => {
        await fetch('/api/admin/pricing-rules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(rule)
        });
        mutatePricing();
    };

    const handleResolveDispute = async (jobId: string, resolution: string) => {
        if (!confirm('Resolve this dispute and close the job?')) return;
        await fetch(`/api/jobs/${jobId}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: 'CLOSED',
                reason: resolution // API expects 'reason', maps it to disputeResolution
            })
        });
        mutateDisputes();
        mutateJobs();
    };

    const handleMarkPaid = async (jobId: string, method: 'MANUAL' | 'SIMULATED') => {
        if (!confirm(`Mark job as PAID via ${method}?`)) return;
        try {
            const res = await fetch(`/api/jobs/${jobId}/payment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ method, reference: 'Admin Action' })
            });
            if (res.ok) {
                alert('Payment recorded');
                mutateJobs();
                setJobDetailDialog({ open: false, job: null });
            } else {
                alert('Failed to record payment');
            }
        } catch (e) {
            console.error(e);
            alert('Error recording payment');
        }
    };

    const handleMismatchAction = async (jobId: string, visitId: string, action: 'UPGRADE' | 'REBOOK', newTier?: string) => {
        const reason = prompt(`Reason for ${action}:`);
        if (!reason) return;

        try {
            const res = await fetch(`/api/jobs/${jobId}/mismatch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, visitId, newTier, reason })
            });
            if (res.ok) {
                alert(`${action} successful`);
                mutateJobs();
                setJobDetailDialog({ open: false, job: null });
            } else {
                const err = await res.json();
                alert(`Error: ${err.error}`);
            }
        } catch (e) {
            console.error(e);
            alert('Failed to handle mismatch');
        }
    };

    const handlePaymentAction = async (jobId: string, action: 'preauth' | 'capture' | 'payout') => {
        if (!confirm(`Confirm ${action} for job ${jobId.slice(0, 8)}?`)) return;
        try {
            const res = await fetch(`/api/jobs/${jobId}/${action}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            if (res.ok) {
                alert(`${action} successful`);
                mutateJobs();
                // Optionally update local dialog state
            } else {
                const err = await res.json();
                alert(`Error: ${err.error}`);
            }
        } catch (e) {
            console.error(e);
            alert(`Failed to ${action}`);
        }
    };

    const jobsContent = useMemo(() => {
        if (!jobs) return <div className="p-6 text-center text-muted-foreground">Loading jobs...</div>;
        if (filteredJobs.length === 0) {
            return (
                <div className="text-center py-16 bg-zinc-900/60 border-white/10">
                    <p className="text-muted-foreground">No jobs match your filters.</p>
                    <Button variant="ghost" onClick={() => {
                        setStatusFilter('ALL');
                        setCategoryFilter('ALL');
                        setDateFilter('');
                    }}>Clear Filters</Button>
                </div>
            );
        }

        return (
            <div className="grid gap-4">
                {filteredJobs.map((job: any) => (
                    <Card
                        key={job.id}
                        className="p-5 border border-white/10 bg-zinc-900/70 backdrop-blur hover:bg-card transition-colors cursor-pointer"
                        onClick={(e) => {
                            // Prevent click if clicking a button
                            if ((e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).closest('button')) return;
                            setJobDetailDialog({ open: true, job });
                        }}
                    >
                        <div className="flex flex-col md:flex-row justify-between gap-4">
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="font-mono">{job.id.slice(0, 8)}</Badge>
                                    <Badge variant={job.status === 'COMPLETED' ? 'default' : 'secondary'}>
                                        {job.status}
                                    </Badge>
                                    {job.needsReview && <Badge variant="destructive">Needs Review</Badge>}
                                    {job.isStuck && <Badge variant="destructive">Stuck</Badge>}
                                </div>
                                <h3 className="font-bold text-lg text-foreground">{job.category}</h3>
                                <p className="text-sm text-muted-foreground">{job.description}</p>
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <MapPin className="w-3 h-3" />
                                    {job.location}
                                    {job.visits?.[0]?.tier && (
                                        <Badge variant="outline" className="ml-2 bg-indigo-500/10 text-indigo-400 border-indigo-500/20">
                                            {job.visits[0].tier}
                                        </Badge>
                                    )}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-xl font-black text-foreground">£{job.fixedPrice}</div>
                                <div className="text-xs text-muted-foreground">{new Date(job.createdAt).toLocaleString()}</div>
                                <div className="text-xs text-primary mt-1 font-medium">Click for Details & Actions</div>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>
        );
    }, [jobs, filteredJobs]);

    const disputesContent = useMemo(() => {
        if (!disputes) return <div className="p-6 text-center text-muted-foreground">Loading disputes...</div>;
        if (disputes.length === 0) {
            return (
                <div className="text-center py-16 bg-zinc-900/60 border-white/10">
                    <p className="text-muted-foreground">No active disputes.</p>
                </div>
            );
        }

        return (
            <div className="grid gap-4">
                {disputes.map((job: any) => (
                    <Card key={job.id} className="p-5 border border-red-200 bg-red-500/10 border-red-500/30">
                        <div className="flex justify-between items-start">
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <Badge variant="destructive">DISPUTED</Badge>
                                    <span className="font-mono text-sm text-muted-foreground">#{job.id.slice(0, 8)}</span>
                                </div>
                                <h3 className="font-bold text-lg text-foreground">{job.disputeReason || 'Unspecified Issue'}</h3>
                                <p className="text-foreground bg-card p-3 rounded border border-destructive/20">
                                    "{job.disputeNotes || 'No additional notes provided.'}"
                                </p>
                                <div className="text-sm text-muted-foreground">
                                    <span className="font-semibold">Customer:</span> {job.customer.name} •
                                    <span className="font-semibold ml-2">Provider:</span> {job.provider?.name || 'Unassigned'}
                                </div>
                            </div>
                            <div className="flex flex-col gap-2">
                                <Button
                                    size="sm"
                                    className="bg-slate-900 text-white"
                                    onClick={() => {
                                        const resolution = prompt('Enter resolution notes:');
                                        if (resolution) handleResolveDispute(job.id, resolution);
                                    }}
                                >
                                    Resolve & Close
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setJobDetailDialog({ open: true, job })}
                                >
                                    View Job Details
                                </Button>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>
        );
    }, [disputes]);

    const [providerEditDialog, setProviderEditDialog] = useState<{ open: boolean; provider?: any }>({ open: false });
    const [editProviderData, setEditProviderData] = useState<any>({});

    const handleUpdateProvider = async (providerId: string, updates: any) => {
        try {
            await fetch(`/api/admin/providers/${providerId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });
            mutateProviders();
            setProviderEditDialog({ open: false });
        } catch (e) {
            console.error('Update provider error', e);
            alert('Failed to update provider');
        }
    };

    const providersContent = useMemo(() => {
        if (!providers) return <div className="p-6 text-center text-muted-foreground">Loading providers...</div>;
        return (
            <div className="grid md:grid-cols-2 gap-4">
                {providers.map((p: any) => (
                    <Card key={p.id} className="p-4 bg-zinc-900 border-white/10">
                        <div className="flex justify-between items-center mb-3">
                            <div>
                                <div className="font-semibold text-foreground">{p.name}</div>
                                <div className="text-xs text-muted-foreground">{p.email}</div>
                            </div>
                            <div className="flex flex-col gap-1 items-end">
                                <Badge variant={
                                    p.providerStatus === 'ACTIVE' ? 'default' :
                                        p.providerStatus === 'PENDING' ? 'secondary' :
                                            p.providerStatus === 'PAUSED' ? 'outline' : 'destructive'
                                }>
                                    {p.providerStatus || 'PENDING'}
                                </Badge>
                                {p.providerType && (
                                    <Badge variant="outline" className="text-xs">
                                        {p.providerType}
                                    </Badge>
                                )}
                            </div>
                        </div>
                        <div className="text-sm text-gray-400 space-y-1">
                            <div>Categories: {p.categories || '—'}</div>
                            {p.capabilities && <div>Capabilities: {p.capabilities}</div>}
                            {p.serviceArea && <div>Service Area: {p.serviceArea}</div>}
                            <div className="text-xs">
                                Jobs: {p._count?.jobsAssigned || 0} | Docs: {p._count?.documents || 0}
                            </div>
                        </div>
                        <div className="mt-4 pt-3 border-t border-white/10">
                            <div className="text-xs font-semibold text-gray-300 mb-2">Provider Actions</div>
                            <div className="flex gap-2 flex-wrap">
                                {/* Show buttons based on current status */}
                                {(p.providerStatus === 'PENDING' || !p.providerStatus) && (
                                    <Button
                                        size="sm"
                                        className="bg-green-600 hover:bg-green-700 text-white"
                                        onClick={() => handleUpdateProvider(p.id, { providerStatus: 'ACTIVE' })}
                                    >
                                        ✓ Approve
                                    </Button>
                                )}

                                {(p.providerStatus === 'ACTIVE' || (!p.providerStatus && p.providerType)) && (
                                    <>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="border-amber-300 text-amber-700 hover:bg-amber-50"
                                            onClick={() => {
                                                if (confirm(`Pause provider ${p.name}? They will not receive new jobs.`)) {
                                                    handleUpdateProvider(p.id, { providerStatus: 'PAUSED' });
                                                }
                                            }}
                                        >
                                            ⏸ Pause
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="destructive"
                                            className="bg-red-600 hover:bg-red-700 text-white"
                                            onClick={() => {
                                                if (confirm(`⚠️ Ban provider ${p.name}? This action cannot be easily undone.`)) {
                                                    handleUpdateProvider(p.id, { providerStatus: 'BANNED' });
                                                }
                                            }}
                                        >
                                            🚫 Ban
                                        </Button>
                                    </>
                                )}

                                {p.providerStatus === 'PAUSED' && (
                                    <>
                                        <Button
                                            size="sm"
                                            className="bg-blue-600 hover:bg-blue-700 text-white"
                                            onClick={() => handleUpdateProvider(p.id, { providerStatus: 'ACTIVE' })}
                                        >
                                            ▶ Resume
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="destructive"
                                            className="bg-red-600 hover:bg-red-700 text-white"
                                            onClick={() => {
                                                if (confirm(`⚠️ Ban provider ${p.name}? This action cannot be easily undone.`)) {
                                                    handleUpdateProvider(p.id, { providerStatus: 'BANNED' });
                                                }
                                            }}
                                        >
                                            🚫 Ban
                                        </Button>
                                    </>
                                )}

                                {p.providerStatus === 'BANNED' && (
                                    <Button
                                        size="sm"
                                        className="bg-green-600 hover:bg-green-700 text-white"
                                        onClick={() => {
                                            if (confirm(`Reactivate banned provider ${p.name}?`)) {
                                                handleUpdateProvider(p.id, { providerStatus: 'ACTIVE' });
                                            }
                                        }}
                                    >
                                        ✓ Reactivate
                                    </Button>
                                )}

                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                        setEditProviderData({
                                            categories: p.categories || '',
                                            capabilities: p.capabilities || '',
                                            providerType: p.providerType || 'HANDYMAN',
                                            serviceArea: p.serviceArea || ''
                                        });
                                        setProviderEditDialog({ open: true, provider: p });
                                    }}
                                >
                                    ✏️ Edit Profile
                                </Button>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>
        );
    }, [providers]);

    const handleSeedPricingRules = useCallback(async () => {
        if (!confirm('This will seed pricing rules from the pricing matrix. Continue?')) return;
        try {
            const res = await fetch('/api/admin/pricing-rules/seed', {
                method: 'POST'
            });
            if (res.ok) {
                mutatePricing();
                alert('Pricing rules seeded successfully!');
            } else {
                alert('Failed to seed pricing rules');
            }
        } catch (e) {
            console.error('Seed pricing rules error', e);
            alert('Failed to seed pricing rules');
        }
    }, [mutatePricing]);

    const pricingContent = useMemo(() => {
        if (!pricingRules) return <div className="p-6 text-center text-gray-400">Loading pricing rules...</div>;
        if (pricingRules.length === 0) {
            return (
                <div className="text-center py-16 bg-white/60 rounded-xl border border-dashed border-white/10">
                    <p className="text-gray-500 mb-4">No pricing rules found.</p>
                    <p className="text-sm text-gray-400 mb-4">Pricing rules need to be seeded from the pricing matrix.</p>
                    <Button onClick={handleSeedPricingRules}>
                        Seed Pricing Rules
                    </Button>
                </div>
            );
        }
        return (
            <div className="space-y-4">
                {pricingRules.map((rule: any) => (
                    <Card key={rule.id} className="p-4 bg-white/70 border border-white/10">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="text-sm uppercase text-gray-400">{rule.category}</div>
                                <div className="font-semibold text-white">{rule.itemType}</div>
                                <div className="text-xs text-gray-500 mt-1">Unit: {rule.unit}</div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Input
                                    type="number"
                                    defaultValue={rule.basePrice}
                                    className="w-28"
                                    onBlur={(e) => handleUpdateRule({ ...rule, basePrice: Number(e.target.value) })}
                                />
                                <Button size="sm" variant="outline" onClick={() => handleUpdateRule({ ...rule, isActive: !rule.isActive })}>
                                    {rule.isActive ? 'Deactivate' : 'Activate'}
                                </Button>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>
        );
    }, [pricingRules, handleSeedPricingRules]);

    const paymentsContent = useMemo(() => {
        if (!paymentsData) return <div className="p-6 text-center text-gray-400">Loading payments...</div>;

        const { payments, totals } = paymentsData;

        if (payments.length === 0) {
            return (
                <div className="text-center py-16 bg-white/60 rounded-xl border border-dashed border-white/10">
                    <p className="text-gray-500">No completed jobs with payments yet.</p>
                </div>
            );
        }

        return (
            <div className="space-y-6">
                {/* Summary Card */}
                <Card className="p-6 bg-gradient-to-br from-blue-900/20 to-indigo-900/20 border-white/10">
                    <h3 className="text-lg font-semibold text-white mb-4">Payment Summary</h3>
                    <div className="grid md:grid-cols-4 gap-4">
                        <div className="bg-white/5 border-white/10">
                            <div className="text-xs text-gray-400 uppercase mb-1">Total Jobs</div>
                            <div className="text-2xl font-bold text-white">{totals.totalJobs}</div>
                        </div>
                        <div className="bg-white/5 border-white/10">
                            <div className="text-xs text-gray-400 uppercase mb-1">Total Revenue</div>
                            <div className="text-2xl font-bold text-green-600">£{totals.totalCustomerPrice.toFixed(2)}</div>
                        </div>
                        <div className="bg-white/5 border-white/10">
                            <div className="text-xs text-gray-400 uppercase mb-1">Platform Commission</div>
                            <div className="text-2xl font-bold text-indigo-600">£{totals.totalPlatformCommission.toFixed(2)}</div>
                            <div className="text-xs text-gray-500 mt-1">({(PLATFORM_FEE_PERCENT * 100).toFixed(0)}%)</div>
                        </div>
                        <div className="bg-white/5 border-white/10">
                            <div className="text-xs text-gray-400 uppercase mb-1">Provider Payouts</div>
                            <div className="text-2xl font-bold text-blue-600">£{totals.totalProviderPayout.toFixed(2)}</div>
                        </div>
                    </div>
                </Card>

                {/* Payments List */}
                <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-white">Payment Details</h3>
                    {payments.map((payment: any) => (
                        <Card key={payment.jobId} className="p-5 border border-white/10/80 bg-white/70">
                            <div className="flex flex-col md:flex-row justify-between gap-4">
                                <div className="flex-1 space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold text-white">Job #{payment.jobId.slice(0, 8)}</span>
                                        <Badge variant={payment.status === 'PAID' ? 'default' : 'secondary'}>
                                            {payment.status}
                                        </Badge>
                                    </div>
                                    <p className="text-sm text-gray-300">{payment.jobDescription}</p>
                                    <div className="text-xs text-gray-400">
                                        <div>Customer: {payment.customerName}</div>
                                        <div>Provider: {payment.providerName}</div>
                                        <div>Completed: {new Date(payment.completedAt).toLocaleDateString()}</div>
                                    </div>
                                </div>

                                <div className="flex gap-4 md:gap-6">
                                    {/* Customer Price */}
                                    <div className="text-center min-w-[100px]">
                                        <div className="text-xs text-gray-400 uppercase mb-1">Customer Paid</div>
                                        <div className="text-lg font-bold text-green-600">£{payment.customerPrice.toFixed(2)}</div>
                                    </div>

                                    {/* Platform Commission */}
                                    <div className="text-center min-w-[100px] border-l border-white/10 pl-4 md:pl-6">
                                        <div className="text-xs text-gray-400 uppercase mb-1">Platform Fee</div>
                                        <div className="text-lg font-bold text-indigo-600">£{payment.platformCommission.toFixed(2)}</div>
                                        <div className="text-xs text-gray-500">({(PLATFORM_FEE_PERCENT * 100).toFixed(0)}%)</div>
                                        <Badge variant="outline" className="mt-1 text-xs">
                                            {payment.feeStatus}
                                        </Badge>
                                    </div>

                                    {/* Provider Payout */}
                                    <div className="text-center min-w-[100px] border-l border-white/10 pl-4 md:pl-6">
                                        <div className="text-xs text-gray-400 uppercase mb-1">Provider Gets</div>
                                        <div className="text-lg font-bold text-blue-600">£{payment.providerPayout.toFixed(2)}</div>
                                        <Badge variant="outline" className="mt-1 text-xs">
                                            {payment.payoutStatus}
                                        </Badge>
                                    </div>
                                </div>
                            </div>

                            {(payment.reviewRating || payment.partsRequired) && (
                                <div className="mt-4 pt-4 border-t border-white/10 grid md:grid-cols-2 gap-4">
                                    {payment.reviewRating && (
                                        <div>
                                            <div className="text-xs font-semibold text-gray-400 uppercase mb-1">Customer Review</div>
                                            <div className="flex items-center gap-1">
                                                <span className="font-bold text-white">{payment.reviewRating}/5</span>
                                                <div className="flex text-yellow-500">
                                                    {[...Array(5)].map((_, i) => (
                                                        <svg key={i} className={`w-3 h-3 ${i < payment.reviewRating ? 'fill-current' : 'text-slate-200'}`} viewBox="0 0 20 20" fill="currentColor">
                                                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                                        </svg>
                                                    ))}
                                                </div>
                                            </div>
                                            {payment.reviewComment && <p className="text-sm text-gray-300 italic mt-1">"{payment.reviewComment}"</p>}
                                        </div>
                                    )}

                                    {payment.partsRequired && (
                                        <div>
                                            <div className="text-xs font-semibold text-gray-400 uppercase mb-1">Parts Used by Provider</div>
                                            <div className="text-sm font-medium text-white">
                                                {payment.partsRequired === 'YES' ? '✅ Yes, parts used' :
                                                    payment.partsRequired === 'NO' ? '❌ No parts used' : 'N/A'}
                                            </div>
                                            {payment.partsNotes && <p className="text-sm text-gray-300 mt-1 bg-slate-50 p-2 rounded border border-slate-100">{payment.partsNotes}</p>}
                                        </div>
                                    )}
                                </div>
                            )}

                            {payment.hasPriceOverride && payment.originalPrice && (
                                <div className="mt-3 pt-3 border-t border-white/10">
                                    <p className="text-xs text-amber-600">
                                        ⚠️ Price was overridden: £{payment.originalPrice.toFixed(2)} → £{payment.customerPrice.toFixed(2)}
                                    </p>
                                    {payment.overrideReason && (
                                        <p className="text-xs text-gray-400 mt-1">Reason: {payment.overrideReason}</p>
                                    )}
                                </div>
                            )}
                        </Card>
                    ))}
                </div>
            </div>
        );
    }, [paymentsData]);

    const [configureCleanersLoading, setConfigureCleanersLoading] = useState(false);

    const handleConfigureCleaners = async () => {
        if (!confirm('Configure all 5 cleaner accounts with cleaning capabilities? This will update their provider type, categories, and capabilities.')) {
            return;
        }
        setConfigureCleanersLoading(true);
        try {
            const res = await fetch('/api/admin/configure-cleaners', {
                method: 'POST'
            });
            if (res.ok) {
                const data = await res.json();
                alert(`Cleaners configured successfully!\n\n${data.cleaners.map((c: any) => `${c.name}: ${c.capabilities.length} capabilities`).join('\n')}`);
                mutateProviders();
            } else {
                const error = await res.json();
                alert(`Failed to configure cleaners: ${error.error}`);
            }
        } catch (e) {
            console.error('Configure cleaners error', e);
            alert('Failed to configure cleaners');
        } finally {
            setConfigureCleanersLoading(false);
        }
    };

    const categoriesContent = (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-semibold text-white">Service Categories</h3>
                    <p className="text-sm text-gray-400">Category configuration and management</p>
                </div>
                <Button
                    onClick={handleConfigureCleaners}
                    disabled={configureCleanersLoading}
                    variant="outline"
                >
                    {configureCleanersLoading ? 'Configuring...' : '⚙️ Configure Cleaners'}
                </Button>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
                {Object.entries(SERVICE_CATEGORIES).map(([key, label]) => (
                    <Card key={key} className="p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-800 text-white shadow-lg border border-white/10">
                        <div className="flex items-center justify-between">
                            <div className="font-semibold">{label}</div>
                            <Sparkles className="w-5 h-5 text-indigo-200" />
                        </div>
                        <p className="text-xs text-slate-200 mt-2">Premium-ready category configuration.</p>
                    </Card>
                ))}
            </div>
        </div>
    );

    const contentMap: Record<string, JSX.Element> = {
        jobs: jobsContent,
        disputes: disputesContent,
        providers: providersContent,
        payments: paymentsContent,
        pricing: pricingContent,
        categories: categoriesContent,
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <ShieldAlert className="w-7 h-7 text-indigo-500" />
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-white">Admin Command Center</h1>
                        <p className="text-sm text-gray-400">Premium controls, instant overrides.</p>
                    </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => { mutateJobs(); mutateProviders(); mutatePricing(); }} className="gap-2 border-white/20 text-white hover:bg-white/5">
                    <RefreshCw className="w-4 h-4" /> Refresh
                </Button>
            </div>

            <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center pb-2">
                <div className="flex gap-2 overflow-x-auto">
                    {tabs.map((tab) => (
                        <Button
                            key={tab.id}
                            variant={activeTab === tab.id ? 'default' : 'outline'}
                            onClick={() => setActiveTab(tab.id)}
                            className={`gap-2 ${activeTab !== tab.id ? 'border-white/20 text-gray-300 hover:text-white hover:bg-white/5' : ''}`}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </Button>
                    ))}
                </div>

                {activeTab === 'jobs' && (
                    <div className="flex gap-2 items-center flex-wrap">
                        <select
                            className="p-2 rounded border border-white/20 bg-zinc-900 text-white text-sm focus:outline-none focus:border-blue-500"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                        >
                            <option value="ALL">All Statuses</option>
                            <option value="REQUESTED">Requested</option>
                            <option value="PRICED">Priced</option>
                            <option value="BOOKED">Booked</option>
                            <option value="ASSIGNING">Assigning</option>
                            <option value="ASSIGNED">Assigned</option>
                            <option value="PREAUTHORISED">Pre-authorised</option>
                            <option value="ARRIVING">Arriving</option>
                            <option value="IN_PROGRESS">In Progress</option>
                            <option value="SCOPE_MISMATCH">Mismatch</option>
                            <option value="PARTS_REQUIRED">Parts Required</option>
                            <option value="COMPLETED">Completed</option>
                            <option value="CAPTURED">Captured</option>
                            <option value="PAID_OUT">Paid Out</option>
                            <option value="CLOSED">Closed</option>
                            <option value="DISPUTED">Disputed</option>
                        </select>
                        <select
                            className="p-2 rounded border border-white/20 bg-zinc-900 text-white text-sm focus:outline-none focus:border-blue-500"
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                        >
                            <option value="ALL">All Categories</option>
                            {Object.entries(SERVICE_CATEGORIES).map(([val, label]) => (
                                <option key={val} value={val}>{label}</option>
                            ))}
                        </select>
                        <Input
                            type="date"
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value)}
                            className="w-auto bg-zinc-900 border-white/20 text-white [color-scheme:dark]"
                        />
                    </div>
                )}
            </div>

            <div className="relative min-h-[200px]">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-4"
                    >
                        {contentMap[activeTab]}
                    </motion.div>
                </AnimatePresence>
            </div>

            {cancelDialog.open && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-zinc-900 border border-white/10 rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 relative">
                        <button
                            onClick={closeCancelDialog}
                            className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                        <div className="space-y-1">
                            <h3 className="text-lg font-semibold text-white">Cancel Job</h3>
                            <p className="text-sm text-gray-400">Provide a reason before cancelling.</p>
                        </div>
                        <textarea
                            className="w-full rounded-md border border-white/10 bg-zinc-800 p-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            rows={4}
                            placeholder="Reason for cancellation"
                            value={cancelDialog.reason}
                            onChange={(e) => setCancelDialog((prev) => ({ ...prev, reason: e.target.value }))}
                        />
                        <div className="flex justify-end gap-3 pt-2">
                            <Button variant="ghost" className="text-gray-400 hover:text-white" onClick={closeCancelDialog} disabled={isSubmittingCancel}>
                                Back
                            </Button>
                            <Button variant="destructive" onClick={submitCancelDialog} disabled={isSubmittingCancel}>
                                {isSubmittingCancel ? 'Cancelling...' : 'Confirm Cancel'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {overrideDialog.open && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-zinc-900 border border-white/10 rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 relative">
                        <button
                            onClick={closeOverrideDialog}
                            className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                        <div className="space-y-1">
                            <h3 className="text-lg font-semibold text-white">Price Override</h3>
                            <p className="text-sm text-gray-400">Provide a new price and reason.</p>
                        </div>
                        <Input
                            type="number"
                            className="bg-zinc-800 border-white/10 text-white"
                            value={overrideDialog.price ?? ''}
                            onChange={(e) => setOverrideDialog((prev) => ({ ...prev, price: Number(e.target.value) }))}
                            placeholder="New price"
                        />
                        <textarea
                            className="w-full rounded-md border border-white/10 bg-zinc-800 p-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            rows={4}
                            placeholder="Reason for override"
                            value={overrideDialog.reason}
                            onChange={(e) => setOverrideDialog((prev) => ({ ...prev, reason: e.target.value }))}
                        />
                        <div className="flex justify-end gap-3 pt-2">
                            <Button variant="ghost" className="text-gray-400 hover:text-white" onClick={closeOverrideDialog} disabled={isSubmittingOverride}>
                                Back
                            </Button>
                            <Button variant="default" className="bg-blue-600 hover:bg-blue-700" onClick={submitOverrideDialog} disabled={isSubmittingOverride}>
                                {isSubmittingOverride ? 'Updating...' : 'Confirm Override'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Job Detail Dialog */}
            {jobDetailDialog.open && jobDetailDialog.job && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-zinc-900 border border-white/10 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto relative">
                        <button
                            onClick={() => setJobDetailDialog({ open: false, job: null })}
                            className="absolute top-6 right-6 text-gray-400 hover:text-white transition-colors z-10"
                        >
                            <X className="w-6 h-6" />
                        </button>

                        <div className="p-8 space-y-8">
                            <div className="pr-12">
                                <div className="flex items-center gap-3 mb-2 flex-wrap">
                                    <h2 className="text-3xl font-bold text-white tracking-tight">Job #{jobDetailDialog.job.id.slice(0, 8)}</h2>
                                    <Badge status={jobDetailDialog.job.status} className="text-sm px-3 py-1">
                                        {jobDetailDialog.job.status}
                                    </Badge>
                                    {jobDetailDialog.job.isRefunded && <Badge variant="destructive" className="animate-pulse">REFUNDED</Badge>}
                                </div>
                                <p className="text-xl text-gray-400 font-medium">{jobDetailDialog.job.description}</p>
                            </div>

                            <div className="grid lg:grid-cols-3 gap-8">
                                {/* Column 1: Core Details & Timeline */}
                                <div className="space-y-8 lg:col-span-2">
                                    <div className="space-y-4">
                                        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                            <Sparkles className="w-4 h-4" /> V1 Visits & Scope Lock
                                        </h3>
                                        {jobDetailDialog.job.visits?.length > 0 ? (
                                            <div className="space-y-4">
                                                {jobDetailDialog.job.visits.map((visit: any) => (
                                                    <div key={visit.id} className="p-4 bg-zinc-800/50 rounded-xl border border-white/10 space-y-4">
                                                        <div className="flex justify-between items-center">
                                                            <div className="flex items-center gap-2">
                                                                <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 font-mono">
                                                                    {visit.item_class} • {visit.tier}
                                                                </Badge>
                                                                <span className="text-xs text-gray-500">{visit.status}</span>
                                                            </div>
                                                            <span className="text-lg font-black text-white">£{visit.price.toFixed(2)}</span>
                                                        </div>

                                                        {visit.scopeSummary && (
                                                            <div className="text-sm bg-black/20 rounded-lg p-3 space-y-2">
                                                                <p className="text-xs font-bold text-gray-500 uppercase">Scope Summary</p>
                                                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-300">
                                                                    <div className="text-gray-500">Includes:</div>
                                                                    <div>{visit.scopeSummary.includes_text}</div>
                                                                    <div className="text-gray-500">Excludes:</div>
                                                                    <div>{visit.scopeSummary.excludes_text}</div>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {jobDetailDialog.job.status === 'SCOPE_MISMATCH' && (
                                                            <div className="flex gap-2 pt-2 border-t border-white/5">
                                                                <Button
                                                                    size="sm"
                                                                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                                                                    onClick={() => handleMismatchAction(jobDetailDialog.job.id, visit.id, 'UPGRADE', 'H3')}
                                                                >
                                                                    Upgrade to H3
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className="flex-1 border-white/10 text-white"
                                                                    onClick={() => handleMismatchAction(jobDetailDialog.job.id, visit.id, 'REBOOK')}
                                                                >
                                                                    Rebook
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="p-6 text-center bg-zinc-800/50 rounded-xl border border-dashed border-white/10 text-gray-500 italic">
                                                No V1 visits found. Check if job is still in legacy state.
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-4">
                                        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                            <RefreshCw className="w-4 h-4" /> State Timeline
                                        </h3>
                                        <div className="space-y-6 relative border-l-2 border-white/5 ml-3 pl-6">
                                            {jobDetailDialog.job.stateChanges?.map((s: any, idx: number) => (
                                                <div key={s.id} className="relative">
                                                    <div className={`absolute -left-[31px] top-1 w-4 h-4 rounded-full border-2 border-zinc-900 ${idx === 0 ? 'bg-blue-500' : 'bg-zinc-700'}`}></div>
                                                    <div className="text-sm font-bold text-white flex items-center gap-2">
                                                        {s.fromStatus} <ChevronRight className="w-3 h-3 text-gray-600" /> {s.toStatus}
                                                    </div>
                                                    <div className="text-xs text-gray-500 mt-1">
                                                        {new Date(s.createdAt).toLocaleString()} • <span className="text-gray-400 font-bold">{s.changedByRole}</span>
                                                    </div>
                                                    {s.reason && (
                                                        <div className="text-xs text-amber-500/80 mt-1 bg-amber-500/5 p-2 rounded border border-amber-500/10 italic">
                                                            "{s.reason}"
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Column 2: Finances & Controls */}
                                <div className="space-y-8">
                                    <div className="p-6 bg-zinc-800/80 rounded-2xl border border-white/10 space-y-6">
                                        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                            <Wallet className="w-4 h-4" /> Financials & Actions
                                        </h3>

                                        <div className="grid grid-cols-1 gap-3">
                                            <div className="p-4 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
                                                <div className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider mb-1">Customer Total</div>
                                                <div className="text-2xl font-black text-white">£{jobDetailDialog.job.fixedPrice.toFixed(2)}</div>
                                            </div>
                                            <div className="p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                                                <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider mb-1">Provider Payout</div>
                                                <div className="text-2xl font-black text-white">£{(jobDetailDialog.job.fixedPrice - (jobDetailDialog.job.platformFeeOverride ?? (jobDetailDialog.job.fixedPrice * PLATFORM_FEE_PERCENT))).toFixed(2)}</div>
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Workflow Controls</p>
                                            <div className="grid grid-cols-1 gap-2">
                                                {jobDetailDialog.job.status === 'ASSIGNED' && (
                                                    <Button variant="default" className="w-full bg-blue-600 hover:bg-blue-700 h-11" onClick={() => handlePaymentAction(jobDetailDialog.job.id, 'preauth')}>
                                                        💳 Pre-authorise Card
                                                    </Button>
                                                )}
                                                {jobDetailDialog.job.status === 'COMPLETED' && (
                                                    <Button variant="default" className="w-full bg-emerald-600 hover:bg-emerald-700 h-11" onClick={() => handlePaymentAction(jobDetailDialog.job.id, 'capture')}>
                                                        🎯 Capture Payment
                                                    </Button>
                                                )}
                                                {jobDetailDialog.job.status === 'CAPTURED' && (
                                                    <Button variant="default" className="w-full bg-indigo-600 hover:bg-indigo-700 h-11" onClick={() => handlePaymentAction(jobDetailDialog.job.id, 'payout')}>
                                                        💸 Process Payout
                                                    </Button>
                                                )}

                                                <div className="flex gap-2">
                                                    <Button size="sm" variant="outline" className="flex-1 bg-transparent border-white/10 text-white hover:bg-white/5" onClick={() => handleOverrideJob(jobDetailDialog.job.id, jobDetailDialog.job.fixedPrice)}>
                                                        Price Override
                                                    </Button>
                                                    <div className="flex items-center justify-center px-3 rounded-md bg-white/5 border border-white/10 text-[10px] font-bold text-gray-500 uppercase whitespace-nowrap">
                                                        V1 Lock Active
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {jobDetailDialog.job.customerPaidAt && (
                                            <div className="p-3 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center gap-2">
                                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                                <span className="text-xs font-bold text-emerald-400 uppercase">
                                                    Paid • {new Date(jobDetailDialog.job.customerPaidAt).toLocaleDateString()}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Recovery Section */}
                                    <div className="p-6 bg-red-500/5 rounded-2xl border border-red-500/10 space-y-4">
                                        <h3 className="text-sm font-bold text-red-500 uppercase tracking-widest flex items-center gap-2">
                                            <AlertCircle className="w-4 h-4" /> Recovery Actions
                                        </h3>
                                        <div className="grid gap-2">
                                            <Button
                                                variant="outline"
                                                className="bg-zinc-900 border-red-500/20 text-red-500 hover:bg-red-500/10 justify-start"
                                                onClick={() => handleOverrideStatus(jobDetailDialog.job.id, 'CANCELLED_FREE')}
                                            >
                                                🚫 Cancel Job (Free)
                                            </Button>
                                            <Button
                                                variant="outline"
                                                className="bg-zinc-900 border-red-500/20 text-red-500 hover:bg-red-500/10 justify-start"
                                                onClick={() => handleOverrideStatus(jobDetailDialog.job.id, 'CANCELLED_CHARGED')}
                                            >
                                                💸 Cancel (Charged)
                                            </Button>
                                        </div>

                                        <div className="pt-2 space-y-2">
                                            <p className="text-[10px] text-red-900/40 font-bold uppercase text-center">Force State Jump (Dangerous)</p>
                                            <div className="grid grid-cols-2 gap-2">
                                                {['ASSIGNING', 'IN_PROGRESS', 'CLOSED', 'BOOKED'].map(st => (
                                                    <Button
                                                        key={st}
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-8 text-[10px] border border-red-500/10 text-red-900/60 hover:text-red-500"
                                                        onClick={() => handleOverrideStatus(jobDetailDialog.job.id, st)}
                                                    >
                                                        {st}
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Evidence Summary */}
                                    {(jobDetailDialog.job.completionPhotos || jobDetailDialog.job.completionNotes) && (
                                        <div className="p-6 bg-zinc-800/80 rounded-2xl border border-white/10 space-y-4">
                                            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                                <RefreshCw className="w-4 h-4" /> Completion Evidence
                                            </h3>
                                            {jobDetailDialog.job.completionNotes && (
                                                <div className="space-y-1">
                                                    <p className="text-[10px] text-gray-500 font-bold uppercase">Provider Notes</p>
                                                    <p className="text-sm text-gray-300 italic">"{jobDetailDialog.job.completionNotes}"</p>
                                                </div>
                                            )}
                                            {jobDetailDialog.job.completionPhotos && (
                                                <div className="space-y-2">
                                                    <p className="text-[10px] text-gray-500 font-bold uppercase">Photo/Video Links</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {jobDetailDialog.job.completionPhotos.split(',').map((url: string, i: number) => (
                                                            <a
                                                                key={i}
                                                                href={url}
                                                                target="_blank"
                                                                className="px-3 py-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-md text-xs hover:bg-blue-500/20 transition-colors"
                                                            >
                                                                Evidence #{i + 1}
                                                            </a>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
