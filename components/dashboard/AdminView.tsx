'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, ShieldAlert, User, UserCog } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function AdminView({ user }: { user: any }) { // user prop accepted for consistency with Dashboard routing
    const { data: jobs, mutate } = useSWR('/api/jobs', fetcher, { refreshInterval: 5000 });

    const handleOverrideStatus = async (jobId: string, newStatus: string) => {
        if (!confirm(`Are you sure you want to force set job ${jobId} to ${newStatus}?`)) return;

        await fetch(`/api/jobs/${jobId}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        mutate();
    };

    if (!jobs) return <div className="p-8 text-center">Loading Admin Dashboard...</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2 mb-6">
                <ShieldAlert className="w-6 h-6 text-red-600" />
                <h1 className="text-2xl font-bold italic tracking-tight uppercase">Admin Command Center</h1>
            </div>

            <div className="grid gap-4">
                {jobs.map((job: any) => (
                    <Card key={job.id} className="p-4 border-l-4 border-l-red-500 bg-gray-50/50">
                        <div className="flex flex-col md:flex-row justify-between gap-4">
                            <div className="space-y-2 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Badge variant="outline" className="font-mono text-xs">{job.id.slice(0, 8)}</Badge>
                                    <Badge 
                                        variant={job.status === 'COMPLETED' ? 'default' : job.status === 'CANCELLED_FREE' || job.status === 'CANCELLED_CHARGED' ? 'destructive' : 'secondary'}
                                        className="font-semibold"
                                    >
                                        {job.status.replace(/_/g, ' ')}
                                    </Badge>
                                    {job.isASAP && <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">ASAP</Badge>}
                                </div>
                                <h3 className="font-bold text-lg">{job.category}</h3>
                                <p className="text-sm text-gray-700">{job.description}</p>
                                <div className="flex items-center gap-1 text-xs text-gray-500">
                                    <MapPin className="w-3 h-3" />
                                    {job.location}
                                </div>
                                
                                {/* Customer Info */}
                                <div className="flex items-center gap-2 text-sm pt-2 border-t border-gray-200 mt-2">
                                    <User className="w-4 h-4 text-blue-600" />
                                    <span className="font-medium text-gray-700">Customer:</span>
                                    <span className="text-gray-600">{job.customer?.name || 'Unknown'} ({job.customer?.email || 'N/A'})</span>
                                </div>
                                
                                {/* Provider Info */}
                                {job.provider && (
                                    <div className="flex items-center gap-2 text-sm">
                                        <UserCog className="w-4 h-4 text-green-600" />
                                        <span className="font-medium text-gray-700">Provider:</span>
                                        <span className="text-gray-600">{job.provider.name} ({job.provider.email})</span>
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-col items-end gap-2 text-right">
                                <div className="text-xl font-black italic">£{job.fixedPrice}</div>
                                <div className="text-xs text-gray-500">Created: {new Date(job.createdAt).toLocaleString()}</div>

                                <div className="flex gap-2 mt-2">
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

            {jobs.length === 0 && (
                <div className="text-center py-20 bg-white rounded-xl border-2 border-dashed border-gray-200">
                    <p className="text-gray-400">No jobs currently in the system.</p>
                </div>
            )}
        </div>
    );
}
