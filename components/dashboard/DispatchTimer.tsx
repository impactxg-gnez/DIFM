
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then(res => res.json());

interface DispatchTimerProps {
    jobId: string;
    onCompleted: (job: any) => void;
    onCancel: () => void;
}

export function DispatchTimer({ jobId, onCompleted, onCancel }: DispatchTimerProps) {
    const [timeLeft, setTimeLeft] = useState(30);
    const [radiusExpanded, setRadiusExpanded] = useState(false);

    const { data: job } = useSWR(`/api/jobs?id=${jobId}`, fetcher, { refreshInterval: 2000 });

    useEffect(() => {
        if (job && job[0]) {
            const status = job[0].status;
            // Exit on success or cancellation
            if (['ACCEPTED', 'CANCELLED_FREE', 'CANCELLED_CHARGED'].includes(status)) {
                onCompleted(job[0]);
            }
        }
    }, [job, onCompleted]);

    useEffect(() => {
        const timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    setRadiusExpanded(true);
                    return 60; // Reset to 60s for "Radius Expansion"
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="flex flex-col items-center justify-center p-8 space-y-6">
            <div className="relative flex items-center justify-center w-32 h-32 rounded-full border-4 border-blue-500">
                <span className="text-4xl font-bold text-gray-900">{timeLeft}s</span>
            </div>

            <div className="text-center space-y-2">
                <h2 className="text-2xl font-semibold text-gray-900">Finding your Pro...</h2>
                <p className="text-gray-500">
                    {radiusExpanded
                        ? "Expanding search radius to nearby areas..."
                        : "Notifying best matched providers nearby..."}
                </p>
            </div>

            <Button variant="destructive" onClick={onCancel} className="mt-4">
                Cancel Request
            </Button>
        </div>
    );
}
