'use client';

import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Card, Badge as StatusBadge } from '@/components/ui/card'; // Import fix pending? used wrong import in CustomerView? No, I made Badge separately.
import { Badge } from '@/components/ui/badge';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function ProviderView({ user }: { user: any }) {
    const { data: jobs, mutate } = useSWR('/api/jobs', fetcher, { refreshInterval: 2000 });

    const acceptJob = async (jobId: string) => {
        await fetch(`/api/jobs/${jobId}/accept`, { method: 'POST' });
        mutate();
    };

    const updateStatus = async (jobId: string, status: string) => {
        await fetch(`/api/jobs/${jobId}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        mutate();
    };

    if (!jobs) return <div>Loading jobs...</div>;

    const availableJobs = jobs.filter((j: any) => j.status === 'DISPATCHING');
    const myJobs = jobs.filter((j: any) => j.providerId === user.id); // API returns mix, filtering here for simple UI separation

    return (
        <div className="grid md:grid-cols-2 gap-8">
            {/* Available Jobs Column */}
            <div className="space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                    Available Jobs
                    <span className="text-xs bg-gray-200 px-2 py-1 rounded-full">{availableJobs.length}</span>
                </h2>
                {availableJobs.map((job: any) => (
                    <Card key={job.id} className="p-4 border-l-4 border-l-yellow-400">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="font-semibold">{job.description}</h3>
                                <p className="text-sm text-gray-500">{job.location} • ${job.price}</p>
                                <p className="text-xs text-gray-400 mt-1">Customer: {job.customer.name}</p>
                            </div>
                        </div>
                        <Button onClick={() => acceptJob(job.id)} className="w-full">Accept Job</Button>
                    </Card>
                ))}
                {availableJobs.length === 0 && <p className="text-gray-500 text-sm">No new jobs nearby.</p>}
            </div>

            {/* My Active Jobs Column */}
            <div className="space-y-4">
                <h2 className="text-xl font-semibold">My Schedule</h2>
                {myJobs.map((job: any) => (
                    <Card key={job.id} className="p-4">
                        <div className="flex justify-between items-center mb-2">
                            <Badge status={job.status}>{job.status}</Badge>
                            <span className="text-sm font-mono">${job.price}</span>
                        </div>
                        <h3 className="font-semibold mb-1">{job.description}</h3>
                        <p className="text-sm text-gray-500 mb-4">{job.location}</p>

                        <div className="flex gap-2">
                            {job.status === 'ACCEPTED' && (
                                <Button onClick={() => updateStatus(job.id, 'IN_PROGRESS')} className="w-full" variant="outline">Start Job</Button>
                            )}
                            {job.status === 'IN_PROGRESS' && (
                                <Button onClick={() => updateStatus(job.id, 'COMPLETED')} className="w-full bg-green-600 hover:bg-green-700">Complete Job</Button>
                            )}
                            {['COMPLETED', 'CUSTOMER_REVIEWED', 'ADMIN_REVIEWED', 'CLOSED'].includes(job.status) && (
                                <div className="w-full text-center text-sm text-green-600 font-medium py-2">Job Done</div>
                            )}
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );
}
