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
import { MapPin, ShieldAlert, Sparkles, Users, Wallet, Sliders, RefreshCw, CreditCard } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const tabs = [
    { id: 'jobs', label: 'Jobs', icon: ShieldAlert },
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

    const jobsContent = useMemo(() => {
        if (!jobs) return <div className="p-6 text-center text-slate-500">Loading jobs...</div>;
        if (filteredJobs.length === 0) {
            return (
                <div className="text-center py-16 bg-white/60 rounded-xl border border-dashed border-slate-200">
                    <p className="text-slate-400">No jobs match your filters.</p>
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
                        className="p-5 border border-slate-200/80 bg-white/70 backdrop-blur hover:bg-white transition-colors cursor-pointer"
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
                                <h3 className="font-bold text-lg">{job.category}</h3>
                                <p className="text-sm text-gray-700">{job.description}</p>
                                <div className="flex items-center gap-1 text-xs text-gray-500">
                                    <MapPin className="w-3 h-3" />
                                    {job.location}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-xl font-black text-slate-900">£{job.fixedPrice}</div>
                                <div className="text-xs text-gray-500">{new Date(job.createdAt).toLocaleString()}</div>
                                <div className="text-xs text-indigo-600 mt-1 font-medium">Click for Details & Actions</div>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>
        );
    }, [jobs, filteredJobs]);

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
        if (!providers) return <div className="p-6 text-center text-slate-500">Loading providers...</div>;
        return (
            <div className="grid md:grid-cols-2 gap-4">
                {providers.map((p: any) => (
                    <Card key={p.id} className="p-4 bg-white/70 border border-slate-200">
                        <div className="flex justify-between items-center mb-3">
                            <div>
                                <div className="font-semibold text-slate-900">{p.name}</div>
                                <div className="text-xs text-slate-500">{p.email}</div>
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
                        <div className="text-sm text-slate-700 space-y-1">
                            <div>Categories: {p.categories || '—'}</div>
                            {p.capabilities && <div>Capabilities: {p.capabilities}</div>}
                            {p.serviceArea && <div>Service Area: {p.serviceArea}</div>}
                            <div className="text-xs">
                                Jobs: {p._count?.jobsAssigned || 0} | Docs: {p._count?.documents || 0}
                            </div>
                        </div>
                        <div className="mt-4 pt-3 border-t border-slate-200">
                            <div className="text-xs font-semibold text-slate-600 mb-2">Provider Actions</div>
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
        if (!pricingRules) return <div className="p-6 text-center text-slate-500">Loading pricing rules...</div>;
        if (pricingRules.length === 0) {
            return (
                <div className="text-center py-16 bg-white/60 rounded-xl border border-dashed border-slate-200">
                    <p className="text-slate-400 mb-4">No pricing rules found.</p>
                    <p className="text-sm text-slate-500 mb-4">Pricing rules need to be seeded from the pricing matrix.</p>
                    <Button onClick={handleSeedPricingRules}>
                        Seed Pricing Rules
                    </Button>
                </div>
            );
        }
        return (
            <div className="space-y-4">
                {pricingRules.map((rule: any) => (
                    <Card key={rule.id} className="p-4 bg-white/70 border border-slate-200">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="text-sm uppercase text-slate-500">{rule.category}</div>
                                <div className="font-semibold text-slate-900">{rule.itemType}</div>
                                <div className="text-xs text-slate-400 mt-1">Unit: {rule.unit}</div>
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
        if (!paymentsData) return <div className="p-6 text-center text-slate-500">Loading payments...</div>;

        const { payments, totals } = paymentsData;

        if (payments.length === 0) {
            return (
                <div className="text-center py-16 bg-white/60 rounded-xl border border-dashed border-slate-200">
                    <p className="text-slate-400">No completed jobs with payments yet.</p>
                </div>
            );
        }

        return (
            <div className="space-y-6">
                {/* Summary Card */}
                <Card className="p-6 bg-gradient-to-br from-indigo-50 to-blue-50 border-indigo-200">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Payment Summary</h3>
                    <div className="grid md:grid-cols-4 gap-4">
                        <div className="bg-white/80 rounded-lg p-4 border border-indigo-100">
                            <div className="text-xs text-slate-500 uppercase mb-1">Total Jobs</div>
                            <div className="text-2xl font-bold text-slate-900">{totals.totalJobs}</div>
                        </div>
                        <div className="bg-white/80 rounded-lg p-4 border border-indigo-100">
                            <div className="text-xs text-slate-500 uppercase mb-1">Total Revenue</div>
                            <div className="text-2xl font-bold text-green-600">£{totals.totalCustomerPrice.toFixed(2)}</div>
                        </div>
                        <div className="bg-white/80 rounded-lg p-4 border border-indigo-100">
                            <div className="text-xs text-slate-500 uppercase mb-1">Platform Commission</div>
                            <div className="text-2xl font-bold text-indigo-600">£{totals.totalPlatformCommission.toFixed(2)}</div>
                            <div className="text-xs text-slate-400 mt-1">({(PLATFORM_FEE_PERCENT * 100).toFixed(0)}%)</div>
                        </div>
                        <div className="bg-white/80 rounded-lg p-4 border border-indigo-100">
                            <div className="text-xs text-slate-500 uppercase mb-1">Provider Payouts</div>
                            <div className="text-2xl font-bold text-blue-600">£{totals.totalProviderPayout.toFixed(2)}</div>
                        </div>
                    </div>
                </Card>

                {/* Payments List */}
                <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-slate-900">Payment Details</h3>
                    {payments.map((payment: any) => (
                        <Card key={payment.jobId} className="p-5 border border-slate-200/80 bg-white/70">
                            <div className="flex flex-col md:flex-row justify-between gap-4">
                                <div className="flex-1 space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold text-slate-900">Job #{payment.jobId.slice(0, 8)}</span>
                                        <Badge variant={payment.status === 'PAID' ? 'default' : 'secondary'}>
                                            {payment.status}
                                        </Badge>
                                    </div>
                                    <p className="text-sm text-slate-600">{payment.jobDescription}</p>
                                    <div className="text-xs text-slate-500">
                                        <div>Customer: {payment.customerName}</div>
                                        <div>Provider: {payment.providerName}</div>
                                        <div>Completed: {new Date(payment.completedAt).toLocaleDateString()}</div>
                                    </div>
                                </div>

                                <div className="flex gap-4 md:gap-6">
                                    {/* Customer Price */}
                                    <div className="text-center min-w-[100px]">
                                        <div className="text-xs text-slate-500 uppercase mb-1">Customer Paid</div>
                                        <div className="text-lg font-bold text-green-600">£{payment.customerPrice.toFixed(2)}</div>
                                    </div>

                                    {/* Platform Commission */}
                                    <div className="text-center min-w-[100px] border-l border-slate-200 pl-4 md:pl-6">
                                        <div className="text-xs text-slate-500 uppercase mb-1">Platform Fee</div>
                                        <div className="text-lg font-bold text-indigo-600">£{payment.platformCommission.toFixed(2)}</div>
                                        <div className="text-xs text-slate-400">({(PLATFORM_FEE_PERCENT * 100).toFixed(0)}%)</div>
                                        <Badge variant="outline" className="mt-1 text-xs">
                                            {payment.feeStatus}
                                        </Badge>
                                    </div>

                                    {/* Provider Payout */}
                                    <div className="text-center min-w-[100px] border-l border-slate-200 pl-4 md:pl-6">
                                        <div className="text-xs text-slate-500 uppercase mb-1">Provider Gets</div>
                                        <div className="text-lg font-bold text-blue-600">£{payment.providerPayout.toFixed(2)}</div>
                                        <Badge variant="outline" className="mt-1 text-xs">
                                            {payment.payoutStatus}
                                        </Badge>
                                    </div>
                                </div>
                            </div>

                            {(payment.reviewRating || payment.partsRequired) && (
                                <div className="mt-4 pt-4 border-t border-slate-200 grid md:grid-cols-2 gap-4">
                                    {payment.reviewRating && (
                                        <div>
                                            <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Customer Review</div>
                                            <div className="flex items-center gap-1">
                                                <span className="font-bold text-slate-900">{payment.reviewRating}/5</span>
                                                <div className="flex text-yellow-500">
                                                    {[...Array(5)].map((_, i) => (
                                                        <svg key={i} className={`w-3 h-3 ${i < payment.reviewRating ? 'fill-current' : 'text-slate-200'}`} viewBox="0 0 20 20" fill="currentColor">
                                                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                                        </svg>
                                                    ))}
                                                </div>
                                            </div>
                                            {payment.reviewComment && <p className="text-sm text-slate-600 italic mt-1">"{payment.reviewComment}"</p>}
                                        </div>
                                    )}

                                    {payment.partsRequired && (
                                        <div>
                                            <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Parts Used by Provider</div>
                                            <div className="text-sm font-medium text-slate-900">
                                                {payment.partsRequired === 'YES' ? '✅ Yes, parts used' :
                                                    payment.partsRequired === 'NO' ? '❌ No parts used' : 'N/A'}
                                            </div>
                                            {payment.partsNotes && <p className="text-sm text-slate-600 mt-1 bg-slate-50 p-2 rounded border border-slate-100">{payment.partsNotes}</p>}
                                        </div>
                                    )}
                                </div>
                            )}

                            {payment.hasPriceOverride && payment.originalPrice && (
                                <div className="mt-3 pt-3 border-t border-slate-200">
                                    <p className="text-xs text-amber-600">
                                        ⚠️ Price was overridden: £{payment.originalPrice.toFixed(2)} → £{payment.customerPrice.toFixed(2)}
                                    </p>
                                    {payment.overrideReason && (
                                        <p className="text-xs text-slate-500 mt-1">Reason: {payment.overrideReason}</p>
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
                    <h3 className="text-lg font-semibold text-slate-900">Service Categories</h3>
                    <p className="text-sm text-slate-500">Category configuration and management</p>
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
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Admin Command Center</h1>
                        <p className="text-sm text-slate-500">Premium controls, instant overrides.</p>
                    </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => { mutateJobs(); mutateProviders(); mutatePricing(); }} className="gap-2">
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
                            className="gap-2"
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </Button>
                    ))}
                </div>

                {activeTab === 'jobs' && (
                    <div className="flex gap-2 items-center flex-wrap">
                        <select
                            className="p-2 rounded border border-slate-300 text-sm"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                        >
                            <option value="ALL">All Statuses</option>
                            <option value="CREATED">Created</option>
                            <option value="DISPATCHED">Dispatched</option>
                            <option value="ACCEPTED">Accepted</option>
                            <option value="IN_PROGRESS">In Progress</option>
                            <option value="COMPLETED">Completed</option>
                            <option value="CLOSED">Closed</option>
                            <option value="CANCELLED_FREE">Cancelled (Free)</option>
                            <option value="CANCELLED_CHARGED">Cancelled (Charged)</option>
                            <option value="DISPUTED">Disputed</option>
                        </select>
                        <select
                            className="p-2 rounded border border-slate-300 text-sm"
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
                            className="w-auto"
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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
                        <div className="space-y-1">
                            <h3 className="text-lg font-semibold text-slate-900">Cancel job</h3>
                            <p className="text-sm text-slate-600">Provide a reason before cancelling.</p>
                        </div>
                        <textarea
                            className="w-full rounded-md border border-slate-200 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            rows={4}
                            placeholder="Reason for cancellation"
                            value={cancelDialog.reason}
                            onChange={(e) => setCancelDialog((prev) => ({ ...prev, reason: e.target.value }))}
                        />
                        <div className="flex justify-end gap-3">
                            <Button variant="outline" onClick={closeCancelDialog} disabled={isSubmittingCancel}>
                                Back
                            </Button>
                            <Button variant="destructive" onClick={submitCancelDialog} disabled={isSubmittingCancel}>
                                {isSubmittingCancel ? 'Cancelling...' : 'Confirm cancel'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {overrideDialog.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
                        <div className="space-y-1">
                            <h3 className="text-lg font-semibold text-slate-900">Price override</h3>
                            <p className="text-sm text-slate-600">Provide a new price and reason.</p>
                        </div>
                        <Input
                            type="number"
                            value={overrideDialog.price ?? ''}
                            onChange={(e) => setOverrideDialog((prev) => ({ ...prev, price: Number(e.target.value) }))}
                            placeholder="New price"
                        />
                        <textarea
                            className="w-full rounded-md border border-slate-200 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            rows={4}
                            placeholder="Reason for override"
                            value={overrideDialog.reason}
                            onChange={(e) => setOverrideDialog((prev) => ({ ...prev, reason: e.target.value }))}
                        />
                        <div className="flex justify-end gap-3">
                            <Button variant="outline" onClick={closeOverrideDialog} disabled={isSubmittingOverride}>
                                Back
                            </Button>
                            <Button variant="default" onClick={submitOverrideDialog} disabled={isSubmittingOverride}>
                                {isSubmittingOverride ? 'Updating...' : 'Confirm override'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Job Detail Dialog */}
            {jobDetailDialog.open && jobDetailDialog.job && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6">
                        <div className="flex justify-between items-start">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <h2 className="text-2xl font-bold text-slate-900">Job #{jobDetailDialog.job.id.slice(0, 8)}</h2>
                                    <Badge variant={jobDetailDialog.job.status === 'COMPLETED' ? 'default' : 'secondary'} className="text-lg">
                                        {jobDetailDialog.job.status}
                                    </Badge>
                                    {jobDetailDialog.job.isRefunded && <Badge variant="destructive" className="ml-2">REFUNDED</Badge>}
                                </div>
                                <p className="text-slate-500">{jobDetailDialog.job.description}</p>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => setJobDetailDialog({ open: false, job: null })}>Close</Button>
                        </div>

                        <div className="grid md:grid-cols-3 gap-6">
                            {/* Column 1: Core Details & Timeline */}
                            <div className="space-y-6 md:col-span-2">
                                <Card className="p-4 bg-slate-50">
                                    <h3 className="font-semibold mb-3">Line Items</h3>
                                    {jobDetailDialog.job.items?.length > 0 ? (
                                        <div className="space-y-2">
                                            {jobDetailDialog.job.items.map((item: any) => (
                                                <div key={item.id} className="flex justify-between text-sm p-2 bg-white rounded border border-slate-200">
                                                    <span>{item.quantity}x {item.itemType} {item.description && `(${item.description})`}</span>
                                                    <span className="font-mono">£{item.totalPrice.toFixed(2)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : <div className="text-sm text-slate-500 italic">No line items (Flat rate?)</div>}
                                </Card>

                                <Card className="p-4">
                                    <h3 className="font-semibold mb-3">State Timeline</h3>
                                    <div className="space-y-4 relative border-l-2 border-slate-200 ml-2 pl-4">
                                        {jobDetailDialog.job.stateChanges?.map((s: any) => (
                                            <div key={s.id} className="relative">
                                                <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-slate-400"></div>
                                                <div className="text-sm font-medium">{s.fromStatus} → {s.toStatus}</div>
                                                <div className="text-xs text-slate-500">
                                                    {new Date(s.createdAt).toLocaleString()} • {s.changedByRole}
                                                </div>
                                                {s.reason && <div className="text-xs text-amber-600 italic">"{s.reason}"</div>}
                                            </div>
                                        ))}
                                    </div>
                                </Card>

                                {/* Evidence Section */}
                                {(jobDetailDialog.job.completionPhotos || jobDetailDialog.job.completionNotes) && (
                                    <Card className="p-4 border-l-4 border-green-500">
                                        <h3 className="font-semibold mb-2">Completion Evidence</h3>
                                        {jobDetailDialog.job.completionNotes && (
                                            <div className="mb-2">
                                                <p className="text-xs text-slate-500 uppercase">Notes</p>
                                                <p className="bg-slate-50 p-2 rounded text-sm">{jobDetailDialog.job.completionNotes}</p>
                                            </div>
                                        )}
                                        {jobDetailDialog.job.completionPhotos && (
                                            <div>
                                                <p className="text-xs text-slate-500 uppercase">Photos</p>
                                                <a href={jobDetailDialog.job.completionPhotos} target="_blank" className="text-blue-600 underline text-sm break-all">
                                                    {jobDetailDialog.job.completionPhotos}
                                                </a>
                                            </div>
                                        )}
                                    </Card>
                                )}
                            </div>

                            {/* Column 2: Finances & Controls */}
                            <div className="space-y-6">
                                <Card className="p-4 bg-indigo-50 border-indigo-100">
                                    <h3 className="font-semibold text-indigo-900 mb-3 flex items-center gap-2">
                                        <Wallet className="w-4 h-4" /> Financials
                                    </h3>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span>Customer Price</span>
                                            <span className="font-bold">£{jobDetailDialog.job.fixedPrice.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between text-indigo-700">
                                            <div className="flex items-center gap-1">
                                                <span>Platform Fee</span>
                                                {jobDetailDialog.job.platformFeeOverride && <span className="text-xs bg-amber-100 px-1 rounded">Overridden</span>}
                                            </div>
                                            <span>
                                                -£{(jobDetailDialog.job.platformFeeOverride ?? (jobDetailDialog.job.fixedPrice * PLATFORM_FEE_PERCENT)).toFixed(2)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between pt-2 border-t border-indigo-200 font-bold text-lg">
                                            <span>Provider Payout</span>
                                            <span>£{(jobDetailDialog.job.fixedPrice - (jobDetailDialog.job.platformFeeOverride ?? (jobDetailDialog.job.fixedPrice * PLATFORM_FEE_PERCENT))).toFixed(2)}</span>
                                        </div>
                                        <div className="pt-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="w-full text-xs"
                                                onClick={() => {
                                                    const newFee = prompt('Override Platform Fee (£):');
                                                    if (newFee && !isNaN(parseFloat(newFee))) {
                                                        // Implement Fee Override
                                                        handleOverrideJob(jobDetailDialog.job.id, undefined, undefined); // This is just for price/provider, need new arg or function
                                                        // TODO: Add separate fee override call
                                                        alert('Fee override will be implemented in backend next step.');
                                                    }
                                                }}
                                            >
                                                Override Fee
                                            </Button>
                                        </div>
                                    </div>
                                </Card>

                                <Card className="p-4 border-red-100 bg-red-50/50">
                                    <h3 className="font-semibold text-red-900 mb-3">Recovery Actions</h3>
                                    <div className="grid gap-2">
                                        <Button
                                            variant="outline"
                                            className="bg-white border-red-200 text-red-700 hover:bg-red-50 justify-start"
                                            onClick={() => handleOverrideStatus(jobDetailDialog.job.id, 'CANCELLED_FREE')}
                                        >
                                            🚫 Cancel Job (Free)
                                        </Button>
                                        <Button
                                            variant="outline"
                                            className="bg-white border-red-200 text-red-700 hover:bg-red-50 justify-start"
                                            onClick={() => handleOverrideStatus(jobDetailDialog.job.id, 'CANCELLED_CHARGED')}
                                        >
                                            💸 Cancel (Charged)
                                        </Button>
                                        {jobDetailDialog.job.providerId && (
                                            <Button
                                                variant="outline"
                                                className="bg-white border-amber-200 text-amber-700 hover:bg-amber-50 justify-start"
                                                onClick={async () => {
                                                    if (confirm('Reassign this job?')) {
                                                        await fetch(`/api/jobs/${jobDetailDialog.job.id}/reassign`, {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({ reason: 'Admin Recovery' })
                                                        });
                                                        mutateJobs();
                                                        setJobDetailDialog({ open: false, job: null });
                                                    }
                                                }}
                                            >
                                                🔄 Reassign Provider
                                            </Button>
                                        )}
                                        <div className="pt-2 border-t border-red-200 mt-2">
                                            <p className="text-xs text-red-600 mb-2 font-semibold">Force State Jump (Dangerous)</p>
                                            <div className="flex flex-wrap gap-1">
                                                {['CREATED', 'DISPATCHED', 'COMPLETED', 'CLOSED'].map(s => (
                                                    <Button
                                                        key={s}
                                                        size="sm"
                                                        variant="ghost"
                                                        className="text-xs h-7 px-2 border border-slate-200 bg-white"
                                                        onClick={() => handleOverrideStatus(jobDetailDialog.job.id, s)}
                                                    >
                                                        {s}
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </Card>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Provider Edit Dialog */}
            {providerEditDialog.open && providerEditDialog.provider && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                        <h3 className="text-lg font-semibold mb-4">Edit Provider: {providerEditDialog.provider.name}</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="text-sm font-medium mb-1 block">Provider Type</label>
                                <select
                                    className="w-full rounded-md border border-slate-200 p-2 text-sm"
                                    value={editProviderData.providerType || 'HANDYMAN'}
                                    onChange={(e) => setEditProviderData({ ...editProviderData, providerType: e.target.value })}
                                >
                                    <option value="HANDYMAN">Handyman</option>
                                    <option value="SPECIALIST">Specialist</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-1 block">Categories (comma-separated)</label>
                                <Input
                                    value={editProviderData.categories || ''}
                                    onChange={(e) => setEditProviderData({ ...editProviderData, categories: e.target.value })}
                                    placeholder="HANDYMAN,PLUMBER,ELECTRICIAN"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-1 block">Capabilities (comma-separated)</label>
                                <Input
                                    value={editProviderData.capabilities || ''}
                                    onChange={(e) => setEditProviderData({ ...editProviderData, capabilities: e.target.value })}
                                    placeholder="HANDYMAN_PLUMBING,HANDYMAN_ELECTRICAL"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-1 block">Service Area</label>
                                <Input
                                    value={editProviderData.serviceArea || ''}
                                    onChange={(e) => setEditProviderData({ ...editProviderData, serviceArea: e.target.value })}
                                    placeholder="London, Greater London area"
                                />
                            </div>
                            <div className="flex justify-end gap-3">
                                <Button variant="outline" onClick={() => setProviderEditDialog({ open: false })}>
                                    Cancel
                                </Button>
                                <Button onClick={() => handleUpdateProvider(providerEditDialog.provider!.id, editProviderData)}>
                                    Save
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
