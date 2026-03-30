import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { CheckCircle2, AlertCircle, Camera, Check, X } from 'lucide-react';
import { CameraUpload } from '@/components/ui/CameraUpload';
import { Input } from '@/components/ui/input';
import { getDisplayPriceFromTier } from '@/lib/ui/tierPricing';

interface ScopeLockProps {
    visits: any[];
    onComplete: (visitId: string, answers: any, scopePhotos: string[]) => void;
    onCancel: () => void;
}

export function ScopeLock({ visits, onComplete, onCancel }: ScopeLockProps) {
    const [currentVisitIndex, setCurrentVisitIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [scopePhotos, setScopePhotos] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const currentVisit = visits[currentVisitIndex];

    if (!currentVisit) return null;

    interface Question {
        id: string;
        text: string;
        type: 'boolean' | 'select' | 'number' | 'text';
        required?: boolean;
        options?: string[];
        affects_time?: boolean;
        affects_safety?: boolean;
        clarifier_type?: 'PRICING' | 'SAFETY';
        capability_tag?: string;
    }

    const getQuestions = (visit: any): Question[] => {
        const matrixQuestions = Array.isArray(visit?.clarifiers) ? visit.clarifiers : [];
        if (matrixQuestions.length > 0) {
            return matrixQuestions.map((q: any) => ({
                id: q.id,
                text: q.question,
                type: q.inputType || 'text',
                required: !!q.required,
                options: Array.isArray(q.options) ? q.options : [],
                affects_time: q.affects_time !== false,
                affects_safety: q.affects_safety === true,
                clarifier_type: q.clarifier_type || (q.affects_time === false ? 'SAFETY' : 'PRICING'),
                capability_tag: q.capability_tag
            }));
        }
        return [];
    };

    const questions = getQuestions(currentVisit);
    const visitCapability = String(currentVisit?.required_capability_tags?.[0] || '').toUpperCase();
    const scopedQuestions = questions.filter((q) => {
        if (!q.capability_tag || !visitCapability) return true;
        return String(q.capability_tag).toUpperCase() === visitCapability;
    });
    const pricingQuestions = scopedQuestions.filter((q) => q.clarifier_type !== 'SAFETY' && q.affects_time !== false);
    const pricingQuestionIds = new Set(pricingQuestions.map((q) => q.id));
    const safetyQuestions = scopedQuestions.filter((q) =>
        !pricingQuestionIds.has(q.id) && (q.clarifier_type === 'SAFETY' || q.affects_time === false || q.affects_safety)
    );
    const [preview, setPreview] = useState({
        status: 'OK' as 'OK' | 'OVERFLOW',
        bookingAllowed: true,
        nextStep: '' as '' | 'REVIEW',
        message: '',
        eta: '',
        overflowDelta: 0,
        minutesBefore: Number(currentVisit?.total_minutes || 0),
        minutesAfter: Number(currentVisit?.total_minutes || 0),
        tierBefore: currentVisit?.tier || 'H1',
        tierAfter: currentVisit?.tier || 'H1',
        priceBefore: getDisplayPriceFromTier(currentVisit?.tier),
        priceAfter: getDisplayPriceFromTier(currentVisit?.tier)
    });

    useEffect(() => {
        setPreview({
            status: 'OK',
            bookingAllowed: true,
            nextStep: '',
            message: '',
            eta: '',
            overflowDelta: 0,
            minutesBefore: Number(currentVisit?.total_minutes || 0),
            minutesAfter: Number(currentVisit?.total_minutes || 0),
            tierBefore: currentVisit?.tier || 'H1',
            tierAfter: currentVisit?.tier || 'H1',
            priceBefore: getDisplayPriceFromTier(currentVisit?.tier),
            priceAfter: getDisplayPriceFromTier(currentVisit?.tier)
        });
    }, [currentVisitIndex]);

    useEffect(() => {
        const visitId = currentVisit?.visit_id || currentVisit?.id;
        if (!visitId) return;
        if (Object.keys(answers).length === 0) return;

        let mounted = true;
        const run = async () => {
            try {
                const res = await fetch(`/api/visits/${visitId}/scope-lock/preview`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ answers })
                });
                if (!res.ok) return;
                const data = await res.json();
                if (!mounted) return;
                if (data.status === 'OVERFLOW') {
                    setPreview({
                        status: 'OVERFLOW',
                        bookingAllowed: false,
                        nextStep: data.nextStep || 'REVIEW',
                        message: data.message || "This job looks more complex than a standard booking. We'll review it and share a custom quote shortly.",
                        eta: data.eta || '30-60 minutes',
                        overflowDelta: Number(data.overflow_delta || 0),
                        minutesBefore: Number(data.minutes_before ?? currentVisit.total_minutes ?? 0),
                        minutesAfter: Number(data.minutes_after ?? currentVisit.total_minutes ?? 0),
                        tierBefore: data.tier_before ?? currentVisit.tier,
                        tierAfter: data.max_ladder ?? currentVisit.tier,
                        priceBefore: getDisplayPriceFromTier(data.tier_before ?? currentVisit.tier),
                        priceAfter: getDisplayPriceFromTier(data.max_ladder ?? currentVisit.tier)
                    });
                    return;
                }
                setPreview({
                    status: 'OK',
                    bookingAllowed: true,
                    nextStep: '',
                    message: '',
                    eta: '',
                    overflowDelta: 0,
                    minutesBefore: Number(data.minutes_before ?? currentVisit.total_minutes ?? 0),
                    minutesAfter: Number(data.minutes_after ?? currentVisit.total_minutes ?? 0),
                    tierBefore: data.tier_before ?? currentVisit.tier,
                    tierAfter: data.tier_after ?? currentVisit.tier,
                    priceBefore: getDisplayPriceFromTier(data.tier_before ?? currentVisit.tier),
                    priceAfter: getDisplayPriceFromTier(data.tier_after ?? currentVisit.tier)
                });
            } catch {
                // Keep latest known preview on transient errors.
            }
        };
        run();
        return () => { mounted = false; };
    }, [answers, currentVisit]);

    const handleAnswer = (qId: string, value: string) => {
        setAnswers(prev => ({ ...prev, [qId]: value }));
    };

    const handleNext = async () => {
        // If last visit, submit
        if (currentVisitIndex === visits.length - 1) {
            setIsSubmitting(true);
            const visitId = currentVisit.visit_id || currentVisit.id;
            await onComplete(visitId, answers, scopePhotos);
            setIsSubmitting(false);
        } else {
            setCurrentVisitIndex(prev => prev + 1);
            setAnswers({});
            setScopePhotos([]);
        }
    };

    const removePhoto = (index: number) => {
        setScopePhotos(prev => prev.filter((_, i) => i !== index));
    };

    const requiredQuestions = scopedQuestions.filter((q) => q.required);
    const isAllAnswered = requiredQuestions.every(q => answers[q.id] !== undefined && answers[q.id] !== '');
    const isPhotoUploaded = scopePhotos.length > 0;

    return (
        <div className="fixed inset-0 z-50 bg-black flex flex-col pt-12 pb-6 px-6 overflow-y-auto">
            <div className="max-w-md mx-auto w-full space-y-8">
                <div className="space-y-2">
                    <Badge className="bg-blue-600">Step 2: Scope Lock</Badge>
                    <h1 className="text-3xl font-bold text-white">Confirm Details</h1>
                    <p className="text-gray-400">
                        Visit {currentVisitIndex + 1} of {visits.length}: {currentVisit.primary_job_item?.display_name || currentVisit.primary_job_item?.job_item_id}
                    </p>
                    <div className="text-xs text-gray-500">
                        Detected tasks: {[
                            currentVisit.primary_job_item?.job_item_id,
                            ...(currentVisit.addon_job_items || []).map((a: any) => a.job_item_id)
                        ].filter(Boolean).join(', ')}
                    </div>
                </div>

                <Card className="bg-zinc-900 border-white/10 text-white">
                    <CardContent className="p-6 space-y-6">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white/5 rounded-lg p-3">
                                <div className="text-xs text-gray-400">Time Estimate</div>
                                <div className="text-lg font-bold">{preview.minutesAfter} min</div>
                                <div className="text-[11px] text-gray-500">was {preview.minutesBefore} min</div>
                            </div>
                            <div className="bg-white/5 rounded-lg p-3">
                                <div className="text-xs text-gray-400">Updated Price</div>
                                <div className="text-lg font-bold">£{Number(preview.priceAfter || 0).toFixed(2)}</div>
                                <div className="text-[11px] text-gray-500">Tier {preview.tierAfter}</div>
                            </div>
                        </div>

                        {preview.status === 'OVERFLOW' && (
                            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                                <p className="text-sm font-medium text-amber-400">{preview.message}</p>
                                <p className="mt-1 text-xs text-amber-200">
                                    Booking is blocked for this visit. Next step: {preview.nextStep || 'REVIEW'}.
                                </p>
                                <p className="mt-1 text-xs text-amber-200">
                                    Expected review ETA: {preview.eta || '30-60 minutes'}.
                                </p>
                                <p className="mt-1 text-xs text-amber-200">
                                    Additional complexity detected: +{preview.overflowDelta} minutes over standard limit.
                                </p>
                            </div>
                        )}

                        {pricingQuestions.length > 0 && (
                            <div className="space-y-1">
                                <p className="text-xs uppercase tracking-wide text-blue-300">Pricing clarifiers</p>
                                <p className="text-[11px] text-gray-400">These answers affect time and price.</p>
                            </div>
                        )}

                        {pricingQuestions.map((q) => (
                            <div key={q.id} className="space-y-4">
                                <Label className="text-lg font-medium leading-tight">
                                    {q.text} {q.required ? <span className="text-red-400">*</span> : null}
                                </Label>

                                {q.type === 'boolean' && (
                                    <div className="grid grid-cols-2 gap-2">
                                        {['yes', 'no'].map((val) => (
                                            <Button
                                                key={val}
                                                variant={answers[q.id] === val ? 'default' : 'outline'}
                                                className={`capitalize ${answers[q.id] === val ? 'bg-blue-600' : 'border-white/10 hover:bg-white/5'}`}
                                                onClick={() => handleAnswer(q.id, val)}
                                            >
                                                {val.replace('_', ' ')}
                                            </Button>
                                        ))}
                                    </div>
                                )}

                                {q.type === 'select' && (
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                        {q.options?.map((val: string) => (
                                            <Button
                                                key={val}
                                                variant={answers[q.id] === val ? 'default' : 'outline'}
                                                className={`text-xs ${answers[q.id] === val ? 'bg-blue-600' : 'border-white/10 hover:bg-white/5'}`}
                                                onClick={() => handleAnswer(q.id, val)}
                                            >
                                                {val}
                                            </Button>
                                        ))}
                                    </div>
                                )}
                                {q.type === 'number' && (
                                    <Input
                                        type="number"
                                        min="0"
                                        inputMode="numeric"
                                        className="bg-white/5 border-white/10 py-6 text-lg"
                                        placeholder="Enter a number..."
                                        value={answers[q.id] || ''}
                                        onChange={(e) => handleAnswer(q.id, e.target.value)}
                                    />
                                )}

                                {q.type === 'text' && (
                                    <Input
                                        className="bg-white/5 border-white/10 py-6 text-lg"
                                        placeholder="Enter details..."
                                        value={answers[q.id] || ''}
                                        onChange={(e) => handleAnswer(q.id, e.target.value)}
                                    />
                                )}
                            </div>
                        ))}

                        {safetyQuestions.length > 0 && (
                            <div className="space-y-1 pt-2 border-t border-white/10">
                                <p className="text-xs uppercase tracking-wide text-amber-300">Safety / inspection clarifiers</p>
                                <p className="text-[11px] text-gray-400">These help with risk checks and on-site safety; they do not change pricing.</p>
                            </div>
                        )}

                        {safetyQuestions.map((q) => (
                            <div key={q.id} className="space-y-4">
                                <Label className="text-lg font-medium leading-tight">
                                    {q.text} {q.required ? <span className="text-red-400">*</span> : null}
                                </Label>

                                {q.type === 'boolean' && (
                                    <div className="grid grid-cols-2 gap-2">
                                        {['yes', 'no'].map((val) => (
                                            <Button
                                                key={val}
                                                variant={answers[q.id] === val ? 'default' : 'outline'}
                                                className={`capitalize ${answers[q.id] === val ? 'bg-blue-600' : 'border-white/10 hover:bg-white/5'}`}
                                                onClick={() => handleAnswer(q.id, val)}
                                            >
                                                {val.replace('_', ' ')}
                                            </Button>
                                        ))}
                                    </div>
                                )}

                                {q.type === 'select' && (
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                        {q.options?.map((val: string) => (
                                            <Button
                                                key={val}
                                                variant={answers[q.id] === val ? 'default' : 'outline'}
                                                className={`text-xs ${answers[q.id] === val ? 'bg-blue-600' : 'border-white/10 hover:bg-white/5'}`}
                                                onClick={() => handleAnswer(q.id, val)}
                                            >
                                                {val}
                                            </Button>
                                        ))}
                                    </div>
                                )}
                                {q.type === 'number' && (
                                    <Input
                                        type="number"
                                        min="0"
                                        inputMode="numeric"
                                        className="bg-white/5 border-white/10 py-6 text-lg"
                                        placeholder="Enter a number..."
                                        value={answers[q.id] || ''}
                                        onChange={(e) => handleAnswer(q.id, e.target.value)}
                                    />
                                )}

                                {q.type === 'text' && (
                                    <Input
                                        className="bg-white/5 border-white/10 py-6 text-lg"
                                        placeholder="Enter details..."
                                        value={answers[q.id] || ''}
                                        onChange={(e) => handleAnswer(q.id, e.target.value)}
                                    />
                                )}
                            </div>
                        ))}

                        <div className="pt-4 border-t border-white/10 space-y-4">
                            <div className="flex items-center gap-3 text-blue-400 mb-2 bg-blue-400/10 p-4 rounded-lg">
                                <Camera className="w-6 h-6 shrink-0" />
                                <div className="space-y-0.5">
                                    <p className="text-sm font-medium">Add photos of the area (Required)</p>
                                    <p className="text-gray-400 text-xs">Capture multiple angles to avoid price mismatches.</p>
                                </div>
                            </div>

                            {/* Photo Gallery */}
                            {scopePhotos.length > 0 && (
                                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                    {scopePhotos.map((photo, idx) => (
                                        <div key={idx} className="relative flex-shrink-0 w-24 h-24 rounded-lg overflow-hidden border border-white/10">
                                            <img src={photo} alt={`Capture ${idx}`} className="w-full h-full object-cover" />
                                            <button
                                                onClick={() => removePhoto(idx)}
                                                className="absolute top-1 right-1 bg-black/60 text-white p-1 rounded-full hover:bg-red-500/80 transition-colors"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <CameraUpload
                                onCapture={(photo) => setScopePhotos(prev => [...prev, photo])}
                                label={scopePhotos.length > 0 ? "Add Another Photo" : "Take Photo"}
                            />

                            {isPhotoUploaded && (
                                <div className="text-green-500 text-xs flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" />
                                    {scopePhotos.length} photo(s) ready
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <div className="space-y-3">
                    <Button
                        className="w-full py-6 text-lg bg-blue-600 hover:bg-blue-700 font-bold"
                        disabled={!isAllAnswered || !isPhotoUploaded || isSubmitting || preview.status === 'OVERFLOW' || preview.bookingAllowed === false}
                        onClick={handleNext}
                    >
                        {isSubmitting
                            ? 'Finalizing...'
                            : preview.status === 'OVERFLOW'
                                ? 'Requires Review'
                                : (currentVisitIndex === visits.length - 1 ? 'Confirm & Book' : 'Next Visit')}
                    </Button>
                    <Button
                        variant="ghost"
                        className="w-full text-gray-500 hover:text-white"
                        onClick={onCancel}
                    >
                        Cancel Booking
                    </Button>
                </div>

                <div className="text-center">
                    <p className="text-xs text-gray-500 flex items-center justify-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Prices stay fixed unless scope differs on site.
                    </p>
                </div>
            </div>
        </div>
    );
}
