'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { clsx } from 'clsx';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function CustomerView({ user }: { user: any }) {
    const { data: jobs, mutate } = useSWR('/api/jobs', fetcher, { refreshInterval: 2000 });
    const [description, setDescription] = useState('');
    const [location, setLocation] = useState('');
    const [price, setPrice] = useState('');
    const [creating, setCreating] = useState(false);

    const createJob = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true);
        await fetch('/api/jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description, location, price }),
        });
        setCreating(false);
        setDescription('');
        setLocation('');
        setPrice('');
        mutate(); // Refresh list immediately
    };

    const submitReview = async (jobId: string) => {
        const rating = prompt("Rate (1-5):");
        const comment = prompt("Comment:");
        if (!rating) return;
        await fetch('/api/reviews/customer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId, rating, comment })
        });
        mutate();
    }

    return (
        <div className="space-y-8">
            {/* Create Job Section */}
            <Card>
                <CardHeader>
                    <CardTitle>Create New Job</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={createJob} className="flex gap-4 items-end">
                        <div className="flex-1 space-y-2">
                            <label className="text-sm font-medium">What needs to be done?</label>
                            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Fix leaky tap" required />
                        </div>
                        <div className="w-48 space-y-2">
                            <label className="text-sm font-medium">Location</label>
                            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Apt 4B" required />
                        </div>
                        <div className="w-32 space-y-2">
                            <label className="text-sm font-medium">Price ($)</label>
                            <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="50" required />
                        </div>
                        <Button type="submit" disabled={creating}>{creating ? 'Creating...' : 'Post Job'}</Button>
                    </form>
                </CardContent>
            </Card>

            {/* Active Jobs List */}
            <div className="space-y-4">
                <h2 className="text-xl font-semibold">Your Jobs</h2>
                {!jobs ? <p>Loading...</p> : jobs.length === 0 ? <p className="text-gray-500">No jobs yet.</p> : (
                    <div className="grid gap-4">
                        {jobs.map((job: any) => (
                            <Card key={job.id} className="overflow-hidden">
                                <div className="flex justify-between p-6 items-center">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="font-semibold text-lg">{job.description}</h3>
                                            <Badge status={job.status}>{job.status}</Badge>
                                        </div>
                                        <p className="text-sm text-gray-500">{job.location} • ${job.price}</p>
                                        {job.provider && <p className="text-sm text-blue-600 mt-2">Provider: {job.provider.name}</p>}
                                    </div>

                                    {job.status === 'COMPLETED' && (
                                        <Button onClick={() => submitReview(job.id)} size="sm">Rate Provider</Button>
                                    )}
                                </div>
                                {/* Visual Progress Bar */}
                                <div className="h-1 w-full bg-gray-100">
                                    <div className={clsx("h-full transition-all duration-500", {
                                        'w-[10%] bg-blue-500': job.status === 'CREATED',
                                        'w-[25%] bg-yellow-500': job.status === 'DISPATCHING',
                                        'w-[50%] bg-indigo-500': job.status === 'ACCEPTED',
                                        'w-[75%] bg-orange-500': job.status === 'IN_PROGRESS',
                                        'w-[100%] bg-green-500': ['COMPLETED', 'CUSTOMER_REVIEWED', 'ADMIN_REVIEWED', 'CLOSED'].includes(job.status)
                                    })} />
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
