
'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, MapPin, Loader2, AlertTriangle, CheckCircle } from 'lucide-react';

interface CameraUploadProps {
    onCapture: (file: string, lat: number, lng: number) => void;
    label?: string;
}

export function CameraUpload({ onCapture, label = "Take Photo" }: CameraUploadProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [isLocating, setIsLocating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [locationCaptured, setLocationCaptured] = useState(false);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setError(null);
        setIsLocating(true);

        // 1. Create Preview
        const reader = new FileReader();
        reader.onloadend = () => {
            setPreview(reader.result as string);
        };
        reader.readAsDataURL(file);

        // 2. Get Location
        if (!navigator.geolocation) {
            setError("Geolocation is not supported by this browser.");
            setIsLocating(false);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                setLocationCaptured(true);
                setIsLocating(false);
                // In a real app, we'd upload the file to storage here.
                // For this demo, we pass the data URL.
                // Re-read file to pass data URL if needed or just use preview logic
                const reader2 = new FileReader();
                reader2.onloadend = () => {
                    onCapture(reader2.result as string, latitude, longitude);
                };
                reader2.readAsDataURL(file);
            },
            (err) => {
                console.error("Location error", err);
                setError("Could not verify location. Please enable GPS.");
                setIsLocating(false);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    const triggerCamera = () => {
        inputRef.current?.click();
    };

    return (
        <div className="space-y-3">
            <input
                type="file"
                accept="image/*"
                capture="environment" // Forces rear camera on mobile
                className="hidden"
                ref={inputRef}
                onChange={handleFileChange}
            />

            {!preview ? (
                <Button
                    type="button"
                    onClick={triggerCamera}
                    variant="outline"
                    className="w-full h-24 border-dashed flex flex-col gap-2"
                >
                    <Camera className="w-6 h-6 text-gray-400" />
                    <span className="text-gray-600">{label}</span>
                </Button>
            ) : (
                <div className="relative rounded-lg overflow-hidden border border-gray-200">
                    <img src={preview} alt="Preview" className="w-full h-48 object-cover" />
                    <button
                        onClick={triggerCamera}
                        className="absolute bottom-2 right-2 bg-black/50 text-white p-2 rounded-full hover:bg-black/70"
                    >
                        <Camera className="w-4 h-4" />
                    </button>

                    {/* Status Overlay */}
                    <div className="absolute top-2 left-2 right-2 flex gap-2">
                        {isLocating && (
                            <div className="bg-blue-500/90 text-white text-xs px-2 py-1 rounded flex items-center gap-1 backdrop-blur-sm">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Verifying Location...
                            </div>
                        )}
                        {locationCaptured && !isLocating && (
                            <div className="bg-green-500/90 text-white text-xs px-2 py-1 rounded flex items-center gap-1 backdrop-blur-sm">
                                <CheckCircle className="w-3 h-3" />
                                Location Verified
                            </div>
                        )}
                        {error && (
                            <div className="bg-red-500/90 text-white text-xs px-2 py-1 rounded flex items-center gap-1 backdrop-blur-sm">
                                <AlertTriangle className="w-3 h-3" />
                                {error}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <p className="text-[10px] text-gray-400 text-center">
                Photo must be taken at the job site. GPS required.
            </p>
        </div>
    );
}
