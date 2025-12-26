'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { SERVICE_CATEGORIES } from '@/lib/constants';
import { MapPin, ShieldAlert, Sparkles, Users, Wallet, Sliders, RefreshCw } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const tabs = [
    { id: 'jobs', label: 'Jobs', icon: ShieldAlert },
    { id: 'providers', label: 'Providers', icon: Users },
    { id: 'pricing', label: 'Pricing Rules', icon: Wallet },
    { id: 'categories', label: 'Categories', icon: Sliders },
];

export function AdminView({ user }: { user: any }) {
    const [activeTab, setActiveTab] = useState('jobs');
    const [cancelDialog, setCancelDialog] = useState<{ open: boolean; jobId?: string; status?: string; reason: string }>({ open: false, reason: '' });
    const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);
    const { data: jobs, mutate: mutateJobs } = useSWR('/api/jobs', fetcher, { refreshInterval: 5000 });
    const { data: providers, mutate: mutateProviders } = useSWR(activeTab === 'providers' ? '/api/admin/providers' : null, fetcher);
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
        let reason: string | undefined;
        if (price !== undefined) {
            const promptValue = window.prompt('Enter reason for price override');
            if (!promptValue) return;
            reason = promptValue;
        }
        await fetch(`/api/jobs/${jobId}/override`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fixedPrice: price !== undefined ? Number(price) : undefined,
                providerId: providerId || undefined,
                reason,
            })
        });
        mutateJobs();
    };

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
                                <div className="text-xs text-gray-500">Created: {new Date(job.createdAt).toLocaleString()}</div>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <Input type="number" placeholder="Override £" onBlur={(e) => handleOverrideJob(job.id, Number(e.target.value) || undefined, undefined)} />
                                    <Input type="text" placeholder="Provider ID" onBlur={(e) => handleOverrideJob(job.id, undefined, e.target.value)} />
                                </div>
                                <div className="flex gap-2 mt-1">
                                    {job.status !== 'CLOSED' && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="text-red-600 border-red-200 hover:bg-red-50"
                                            onClick={() => handleOverrideStatus(job.id, 'CANCELLED_FREE')}
                                        >
                                            Force Cancel
                                        </Button>
                                    )}
                                    {job.status === 'IN_PROGRESS' && (
                                        <Button
                                            size="sm"
                                            className="bg-green-600 hover:bg-green-700"
                                            onClick={() => handleOverrideStatus(job.id, 'COMPLETED')}
                                        >
                                            Force Complete
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>
        );
    }, [jobs]);

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
                            <Badge variant={p.isOnline ? 'default' : 'secondary'}>{p.isOnline ? 'Online' : 'Offline'}</Badge>
                        </div>
                        <div className="text-sm text-slate-700">Categories: {p.categories || '—'}</div>
                        <div className="text-xs text-slate-500 mt-2">Lat/Lng: {p.latitude?.toFixed(4)}, {p.longitude?.toFixed(4)}</div>
                    </Card>
                ))}
            </div>
        );
    }, [providers]);

    const pricingContent = useMemo(() => {
        if (!pricingRules) return <div className="p-6 text-center text-slate-500">Loading pricing rules...</div>;
        return (
            <div className="space-y-4">
                {pricingRules.map((rule: any) => (
                    <Card key={rule.id} className="p-4 bg-white/70 border border-slate-200">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="text-sm uppercase text-slate-500">{rule.category}</div>
                                <div className="font-semibold text-slate-900">{rule.itemType}</div>
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
    }, [pricingRules]);

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
        </div>
    );
}
