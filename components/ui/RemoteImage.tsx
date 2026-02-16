import React, { useEffect, useState } from 'react';

interface RemoteImageProps {
    path: string;
    bucket: 'SCOPE' | 'COMPLETION' | 'PART' | 'MISMATCH';
    className?: string;
    alt?: string;
}

export function RemoteImage({ path, bucket, className, alt }: RemoteImageProps) {
    const [src, setSrc] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!path) return;

        // If it looks like base64, use it directly
        if (path.startsWith('data:image') || path.length > 500) {
            setSrc(path);
            setLoading(false);
            return;
        }

        const fetchUrl = async () => {
            try {
                setLoading(true);
                const res = await fetch(`/api/storage/signed-url?path=${encodeURIComponent(path)}&bucket=${bucket}`);
                const data = await res.json();
                if (data.signedUrl) {
                    setSrc(data.signedUrl);
                } else {
                    setError(true);
                }
            } catch (err) {
                console.error('Error fetching signed URL', err);
                setError(true);
            } finally {
                setLoading(false);
            }
        };

        fetchUrl();
    }, [path, bucket]);

    if (!path) return null;

    if (loading) return <div className={`animate-pulse bg-zinc-800 rounded-lg ${className}`} />;
    if (error) return <div className={`bg-zinc-900 border border-white/10 rounded-lg flex items-center justify-center p-4 text-xs text-gray-500 ${className}`}>Failed to load image</div>;

    return (
        <img
            src={src || ''}
            alt={alt || 'Evidence photo'}
            className={className}
        />
    );
}
