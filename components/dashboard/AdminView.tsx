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
        if (jobs.length === 0) {
            return (
                <div className="text-center py-16 bg-white/60 rounded-xl border border-dashed border-slate-200">
                    <p className="text-slate-400">No jobs currently in the system.</p>
                </div>
            );
        }

        return (
            <div className="grid gap-4">
                {jobs.map((job: any) => (
                    <Card key={job.id} className="p-5 border border-slate-200/80 bg-white/70 backdrop-blur">
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
                                {job.items?.length > 0 && (
                                    <div className="text-xs text-slate-700 bg-slate-50 border rounded p-3 space-y-1">
                                        {job.items.map((item: any) => (
                                            <div key={item.id} className="flex justify-between">
                                                <span>{item.quantity}x {item.itemType}</span>
                                                <span>£{item.totalPrice.toFixed(2)}</span>
                                            </div>
                                        ))}
                                        <div className="flex justify-between border-t pt-1 font-semibold">
                                            <span>Total</span>
                                            <span>£{job.fixedPrice.toFixed(2)}</span>
                                        </div>
                                    </div>
                                )}
                                {job.stateChanges?.length > 0 && (
                                    <div className="text-xs text-slate-600 space-y-1">
                                        <div className="font-semibold">State history</div>
                                        {job.stateChanges.slice(-3).map((s: any) => (
                                            <div key={s.id} className="flex justify-between">
                                                <span>{s.fromStatus} → {s.toStatus}</span>
                                                <span>{new Date(s.createdAt).toLocaleString()}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {job.stuckReason && <div className="text-xs text-red-600">⚠ {job.stuckReason}</div>}
                            </div>

                            <div className="flex flex-col gap-2 text-right min-w-[240px]">
                                <div className="text-xl font-black text-slate-900">£{job.fixedPrice}</div>
                                {job.priceOverrides && job.priceOverrides.length > 0 && (
                                    <div className="text-xs text-amber-600">
                                        Overridden from £{job.priceOverrides[0].oldPrice.toFixed(2)}
                                    </div>
                                )}
                                <div className="text-xs text-gray-500">Created: {new Date(job.createdAt).toLocaleString()}</div>
                                <div className="flex gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                            const newPrice = prompt(`Enter new price for job ${job.id.slice(0, 8)}:\nCurrent: £${job.fixedPrice}`);
                                            if (newPrice) {
                                                const val = Number(newPrice);
                                                if (!isNaN(val) && val > 0) {
                                                    handleOverrideJob(job.id, val, undefined);
                                                } else {
                                                    alert('Please enter a valid price');
                                                }
                                            }
                                        }}
                                        className="text-xs"
                                    >
                                        Override Price
                                    </Button>
                                    <Input 
                                        type="text" 
                                        placeholder="Provider ID" 
                                        className="text-xs"
                                        onBlur={(e) => {
                                            if (e.target.value.trim()) {
                                                handleOverrideJob(job.id, undefined, e.target.value.trim());
                                                e.target.value = '';
                                            }
                                        }} 
                                    />
                                </div>
                                <div className="space-y-2 mt-2">
                                    <div className="text-xs font-semibold text-slate-600">Next Valid States:</div>
                                    <div className="flex flex-wrap gap-1">
                                        {getNextStates(job.status as any).map((nextStatus) => (
                                            <Button
                                                key={nextStatus}
                                                size="sm"
                                                variant="outline"
                                                className="text-xs"
                                                onClick={() => {
                                                    if (nextStatus.startsWith('CANCELLED')) {
                                                        const cancelTarget = job.status === 'IN_PROGRESS' ? 'CANCELLED_CHARGED' : 'CANCELLED_FREE';
                                                        handleOverrideStatus(job.id, cancelTarget);
                                                    } else {
                                                        handleOverrideStatus(job.id, nextStatus);
                                                    }
                                                }}
                                            >
                                                → {nextStatus}
                                            </Button>
                                        ))}
                                        {getNextStates(job.status as any).length === 0 && (
                                            <span className="text-xs text-slate-400">No valid transitions</span>
                                        )}
                                    </div>
                                    {job.providerId && (
                                        <div className="mt-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={async () => {
                                                    if (confirm('Reassign this job? It will be returned to dispatch pool.')) {
                                                        await fetch(`/api/jobs/${job.id}/reassign`, {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({ reason: 'Admin reassignment' })
                                                        });
                                                        mutateJobs();
                                                    }
                                                }}
                                            >
                                                Reassign Job
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>
        );
    }, [jobs]);

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
                                {p.providerStatus === 'PENDING' && (
                                    <Button
                                        size="sm"
                                        className="bg-green-600 hover:bg-green-700"
                                        onClick={() => handleUpdateProvider(p.id, { providerStatus: 'ACTIVE' })}
                                    >
                                        ✓ Approve
                                    </Button>
                                )}
                                {p.providerStatus === 'ACTIVE' && (
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
                                    <Button
                                        size="sm"
                                        className="bg-blue-600 hover:bg-blue-700"
                                        onClick={() => handleUpdateProvider(p.id, { providerStatus: 'ACTIVE' })}
                                    >
                                        ▶ Resume
                                    </Button>
                                )}
                                {p.providerStatus === 'BANNED' && (
                                    <Button
                                        size="sm"
                                        className="bg-green-600 hover:bg-green-700"
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

    const categoriesContent = (
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

            <div className="flex gap-2 overflow-x-auto pb-2">
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
