'use client';

import { useState, useEffect } from 'react';
import { X, CheckCircle, Send, Loader2, Camera } from 'lucide-react';
import { REVIEW_QUOTE_ETA, REVIEW_QUOTE_MESSAGE } from '@/lib/pricing/bookingCopy';

interface ReviewQuoteModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Pre-populated from the search input */
    rawInput?: string;
    detectedJob?: string;
    parsedEntities?: Record<string, unknown>;
    quantity?: number;
    estimatedMinutes?: number;
    confidenceScore?: number;
    numericIntentConfidence?: number;
    confidenceLabel?: string | null;
    inferredCategory?: string | null;
    parserStageUsed?: string | null;
    /** Only for audit trail if ever submitted alongside a blocked tooling path; omit for normal leads. */
    blockedReason?: string | null;
    /** Pre-fill name/email from logged-in user if available */
    prefilledName?: string;
    prefilledEmail?: string;
    /** Pre-fill job address from search / booking context */
    prefilledLocation?: string;
    prefilledLatitude?: number | null;
    prefilledLongitude?: number | null;
}

type Phase = 'form' | 'submitting' | 'success';

export function ReviewQuoteModal({
    isOpen,
    onClose,
    rawInput = '',
    detectedJob,
    parsedEntities,
    quantity = 1,
    estimatedMinutes = 0,
    confidenceScore = 0,
    numericIntentConfidence,
    confidenceLabel,
    inferredCategory,
    parserStageUsed,
    blockedReason,
    prefilledName = '',
    prefilledEmail = '',
    prefilledLocation = '',
    prefilledLatitude = null,
    prefilledLongitude = null,
}: ReviewQuoteModalProps) {
    const [phase, setPhase] = useState<Phase>('form');
    const [name, setName] = useState(prefilledName);
    const [email, setEmail] = useState(prefilledEmail);
    const [phone, setPhone] = useState('');
    const [location, setLocation] = useState(prefilledLocation);
    const [latitude, setLatitude] = useState<number | null>(prefilledLatitude);
    const [longitude, setLongitude] = useState<number | null>(prefilledLongitude);
    const [notes, setNotes] = useState('');
    const [photos, setPhotos] = useState<string[]>([]);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        setName(prefilledName);
        setEmail(prefilledEmail);
        if (prefilledLocation?.trim()) {
            setLocation(prefilledLocation.trim());
        }
        if (prefilledLatitude != null && prefilledLongitude != null) {
            setLatitude(prefilledLatitude);
            setLongitude(prefilledLongitude);
        }
    }, [isOpen, prefilledName, prefilledEmail, prefilledLocation, prefilledLatitude, prefilledLongitude]);

    if (!isOpen) return null;

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (photos.length >= 3) {
            setError('Maximum 3 photos allowed');
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            setPhotos(prev => [...prev, reader.result as string]);
        };
        reader.readAsDataURL(file);
    };

    const removePhoto = (index: number) => {
        setPhotos(prev => prev.filter((_, i) => i !== index));
    };

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    const phoneDigits = phone.replace(/\D/g, '');
    const phoneOk = phoneDigits.length >= 8 && phoneDigits.length <= 15;
    const canSubmit = name.trim().length > 0 && emailOk && phoneOk && location.trim().length > 0;

    const useCurrentLocation = () => {
        if (!navigator.geolocation) {
            setError('Location is not available on this device');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude: lat, longitude: lng } = position.coords;
                setLatitude(lat);
                setLongitude(lng);
                try {
                    const res = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
                    );
                    const data = await res.json();
                    const label = data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                    setLocation(label);
                    setError('');
                } catch {
                    setLocation(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
                }
            },
            () => setError('Could not detect your location. Please enter the address manually.'),
            { enableHighAccuracy: true, timeout: 10000 },
        );
    };

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setPhase('submitting');
        setError('');
        try {
            const numericConf =
                numericIntentConfidence != null && Number.isFinite(Number(numericIntentConfidence))
                    ? Number(numericIntentConfidence)
                    : Number(confidenceScore) || 0;
            const res = await fetch('/api/admin/pending-reviews', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    raw_input: rawInput,
                    detected_job: detectedJob ?? null,
                    parsed_entities: parsedEntities ?? null,
                    quantity,
                    estimated_minutes: estimatedMinutes,
                    confidence_score: numericConf,
                    confidence_label: confidenceLabel ?? null,
                    inferred_category: inferredCategory ?? null,
                    parser_stage_used: parserStageUsed ?? null,
                    blocked_reason: blockedReason ?? null,
                    user_name: name.trim(),
                    email: email.trim(),
                    phone: phone.trim(),
                    location: location.trim(),
                    latitude,
                    longitude,
                    notes: notes.trim() || null,
                    uploaded_photos: photos.length > 0 ? photos.join(',') : null,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Submission failed');
            }
            setPhase('success');
        } catch (e: any) {
            setError(e?.message || 'Something went wrong. Please try again.');
            setPhase('form');
        }
    };

    const handleClose = () => {
        setPhase('form');
        setName(prefilledName);
        setEmail(prefilledEmail);
        setPhone('');
        setLocation(prefilledLocation);
        setLatitude(prefilledLatitude);
        setLongitude(prefilledLongitude);
        setNotes('');
        setError('');
        onClose();
    };

    return (
        /* Backdrop */
        <div
            className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
            onClick={(e) => { if (e.target === e.currentTarget && phase !== 'submitting') handleClose(); }}
        >
            <div className="relative w-full sm:max-w-[440px] bg-[#111113] border border-white/10 rounded-t-[28px] sm:rounded-[28px] overflow-hidden shadow-2xl">

                {/* Close */}
                {phase !== 'submitting' && (
                    <button
                        onClick={handleClose}
                        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
                    >
                        <X className="w-4 h-4 text-white/60" />
                    </button>
                )}

                {phase === 'success' ? (
                    /* ── SUCCESS STATE ── */
                    <div className="flex flex-col items-center justify-center px-8 py-14 gap-6 text-center">
                        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
                            <CheckCircle className="w-8 h-8 text-emerald-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white mb-2">Request Submitted!</h2>
                            <p className="text-sm text-white/60 leading-relaxed">
                                Thanks — our team will review your request and share a custom quote shortly.
                            </p>
                        </div>
                        <button
                            onClick={handleClose}
                            className="w-full py-3 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-colors"
                        >
                            Done
                        </button>
                    </div>
                ) : (
                    /* ── FORM STATE ── */
                    <div className="flex flex-col">
                        {/* Header */}
                        <div className="px-6 pt-6 pb-4 border-b border-white/5">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400 mb-1">Custom Quote Required</div>
                            <h2 className="text-lg font-bold text-white leading-snug">
                                {REVIEW_QUOTE_MESSAGE}
                            </h2>
                            <p className="text-xs text-white/50 mt-1 leading-relaxed">
                                Expected review ETA: {REVIEW_QUOTE_ETA}. Fill in your details below and we&apos;ll get back to you.
                            </p>
                            {rawInput && (
                                <div className="mt-3 px-3 py-2 bg-white/5 rounded-xl border border-white/5 text-xs text-white/40 italic truncate">
                                    "{rawInput}"
                                </div>
                            )}
                        </div>

                        {/* Form */}
                        <div className="px-6 py-5 space-y-4 overflow-y-auto max-h-[55vh]">
                            {/* Full Name */}
                            <div>
                                <label className="text-[10px] font-semibold text-white/60 uppercase tracking-wider block mb-1.5">
                                    Full Name <span className="text-red-400">*</span>
                                </label>
                                <input
                                    type="text"
                                    autoComplete="name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Your full name"
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-amber-500/50 transition-colors"
                                />
                            </div>

                            {/* Email */}
                            <div>
                                <label className="text-[10px] font-semibold text-white/60 uppercase tracking-wider block mb-1.5">
                                    Email <span className="text-red-400">*</span>
                                </label>
                                <input
                                    type="email"
                                    autoComplete="email"
                                    inputMode="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@example.com"
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-amber-500/50 transition-colors"
                                />
                            </div>

                            {/* Phone */}
                            <div>
                                <label className="text-[10px] font-semibold text-white/60 uppercase tracking-wider block mb-1.5">
                                    Phone Number <span className="text-red-400">*</span>
                                </label>
                                <input
                                    type="tel"
                                    autoComplete="tel"
                                    inputMode="tel"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder="+44 7700 900000"
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-amber-500/50 transition-colors"
                                />
                                <p className="text-[9px] text-white/30 mt-1">We'll use this to contact you with your quote.</p>
                            </div>

                            {/* Job location */}
                            <div>
                                <label className="text-[10px] font-semibold text-white/60 uppercase tracking-wider block mb-1.5">
                                    Job Location <span className="text-red-400">*</span>
                                </label>
                                <input
                                    type="text"
                                    autoComplete="street-address"
                                    value={location}
                                    onChange={(e) => setLocation(e.target.value)}
                                    placeholder="Full address where the work is needed"
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-amber-500/50 transition-colors"
                                />
                                <button
                                    type="button"
                                    onClick={useCurrentLocation}
                                    className="mt-2 text-[11px] font-semibold text-amber-400 hover:text-amber-300"
                                >
                                    Use my current location
                                </button>
                            </div>

                            {/* Notes */}
                            <div>
                                <label className="text-[10px] font-semibold text-white/60 uppercase tracking-wider block mb-1.5">
                                    Additional Notes <span className="text-white/30">(optional)</span>
                                </label>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Any extra details, preferred time, access info…"
                                    rows={3}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-amber-500/50 transition-colors resize-none"
                                />
                            </div>

                            {/* Optional Photos */}
                            <div>
                                <label className="text-[10px] font-semibold text-white/60 uppercase tracking-wider block mb-1.5">
                                    Photos <span className="text-white/30">(optional, max 3)</span>
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {photos.map((p, i) => (
                                        <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-white/10 group">
                                            <img src={p} className="w-full h-full object-cover" />
                                            <button 
                                                onClick={() => removePhoto(i)}
                                                className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}
                                    {photos.length < 3 && (
                                        <label className="w-20 h-20 rounded-xl bg-white/5 border border-dashed border-white/20 flex flex-col items-center justify-center cursor-pointer hover:bg-white/10 transition-colors">
                                            <div className="bg-white/10 p-2 rounded-full mb-1">
                                                <Camera className="w-4 h-4 text-white/60" />
                                            </div>
                                            <span className="text-[9px] text-white/40 font-bold uppercase">Add</span>
                                            <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
                                        </label>
                                    )}
                                </div>
                            </div>

                            {error && (
                                <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-300">
                                    {error}
                                </div>
                            )}
                        </div>

                        {/* CTA */}
                        <div className="px-6 pb-8 pt-2">
                            <button
                                onClick={handleSubmit}
                                disabled={!canSubmit || phase === 'submitting'}
                                className={`w-full flex items-center justify-center gap-2 py-4 rounded-full font-bold text-sm transition-all ${
                                    canSubmit && phase !== 'submitting'
                                        ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-[0_8px_24px_rgba(245,158,11,0.35)]'
                                        : 'bg-white/5 text-white/30 cursor-not-allowed'
                                }`}
                            >
                                {phase === 'submitting' ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span>Submitting…</span>
                                    </>
                                ) : (
                                    <>
                                        <Send className="w-4 h-4" />
                                        <span>Request Custom Quote</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
