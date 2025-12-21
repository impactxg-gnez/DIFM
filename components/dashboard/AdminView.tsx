'use client';

import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function AdminView({ user }: { user: any }) {
    const { data: jobs, mutate } = useSWR('/api/jobs', fetcher, { refreshInterval: 5000 });

    const adminReview = async (jobId: string) => {
        const rating = prompt("Reliability Rating (1-5):");
        const notes = prompt("Internal Notes:");
        if (!rating) return;
        await fetch('/api/reviews/admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId, rating, notes })
        });
        mutate();
    }

    const closeJob = async (jobId: string) => {
        if (!confirm("Close this job permanently?")) return;
        await fetch(`/api/jobs/${jobId}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'CLOSED' })
        });
        mutate();
    }

    if (!jobs) return <div>Loading...</div>;

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold">Admin Ops Center</h2>

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                        <tr>
                            <th className="px-6 py-3">ID</th>
                            <th className="px-6 py-3">Customer</th>
                            <th className="px-6 py-3">Provider</th>
                            <th className="px-6 py-3">Status</th>
                            <th className="px-6 py-3">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {jobs.map((job: any) => (
                            <tr key={job.id} className="bg-white border-b hover:bg-gray-50">
                                <td className="px-6 py-4 font-mono">{job.id.slice(0, 8)}...</td>
                                <td className="px-6 py-4">{job.customer.name}</td>
                                <td className="px-6 py-4">{job.provider?.name || '-'}</td>
                                <td className="px-6 py-4"><Badge status={job.status}>{job.status}</Badge></td>
                                <td className="px-6 py-4 space-x-2">
                                    {(job.status === 'CUSTOMER_REVIEWED' || job.status === 'COMPLETED') && (
                                        <Button size="sm" variant="outline" onClick={() => adminReview(job.id)}>Rate</Button>
                                    )}
                                    {job.status === 'ADMIN_REVIEWED' && (
                                        <Button size="sm" onClick={() => closeJob(job.id)}>Close Job</Button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
