import React, { useEffect, useRef, useState } from 'react';
import { inferScopeAnswersFromDescription } from '@/lib/pricing/scopeAnswerInference';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { CheckCircle2, AlertCircle, Camera, X } from 'lucide-react';
import { CameraUpload } from '@/components/ui/CameraUpload';
import { Input } from '@/components/ui/input';

const MIN_SCOPE_DESCRIPTION_CHARS = 10;

interface ScopeLockProps {
    visits: any[];
    /** Original text from the booking flow — used to prefill clarifiers where we can infer answers. */
    jobDescription?: string;
    onComplete: (visitId: string, answers: any, scopePhotos: string[], customerScopeDescription: string) => void;
    onCancel: () => void;
}

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

function normalizeInputType(raw: unknown): Question['type'] {
    const t = String(raw || 'text').toLowerCase();
    if (t === 'boolean' || t === 'select' || t === 'number' || t === 'text') return t;
    return 'text';
}

function buildQuestionsFromVisit(visit: any): Question[] {
    const matrixQuestions = Array.isArray(visit?.clarifiers) ? visit.clarifiers : [];
    if (matrixQuestions.length === 0) return [];
    return matrixQuestions.map((q: any) => ({
        id: q.id,
        text: q.question,
        type: normalizeInputType(q.inputType),
        required: !!q.required,
        options: Array.isArray(q.options) ? q.options : [],
        affects_time: q.affects_time !== false,
        affects_safety: q.affects_safety === true,
        clarifier_type: q.clarifier_type || (q.affects_time === false ? 'SAFETY' : 'PRICING'),
        capability_tag: q.capability_tag,
    }));
}

export function ScopeLock({ visits, jobDescription, onComplete, onCancel }: ScopeLockProps) {
    const [currentVisitIndex, setCurrentVisitIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [scopePhotos, setScopePhotos] = useState<string[]>([]);
    const [scopeDescription, setScopeDescription] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    /** When visits have clarifiers: collect answers first, then show price + photos. */
    const [clarifierPhaseDone, setClarifierPhaseDone] = useState(false);
    const [preview, setPreview] = useState({
        status: 'OK' as 'OK' | 'OVERFLOW',
        bookingAllowed: true,
        nextStep: '' as '' | 'REVIEW',
        message: '',
        eta: '',
        overflowDelta: 0,
        minutesBefore: 0,
        minutesAfter: 0,
        tierBefore: 'H1',
        tierAfter: 'H1',
        priceBefore: 0,
        priceAfter: 0,
    });

    const currentVisit = visits[currentVisitIndex] ?? null;
    const prefilledVisitIdsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        setClarifierPhaseDone(false);
        setAnswers({});
        setScopePhotos([]);
        setScopeDescription((jobDescription || '').trim());
    }, [currentVisitIndex, jobDescription]);

    /** One-time per visit: seed answers from job text (still editable). */
    useEffect(() => {
        if (!currentVisit || !jobDescription?.trim()) return;
        const vid = String(currentVisit.visit_id || currentVisit.id || '');
        if (!vid || prefilledVisitIdsRef.current.has(vid)) return;
        const qs = buildQuestionsFromVisit(currentVisit);
        const visitCapability = String(currentVisit?.required_capability_tags?.[0] || '').toUpperCase();
        const scoped = qs.filter((q: Question) => {
            if (!q.capability_tag || !visitCapability) return true;
            return String(q.capability_tag).toUpperCase() === visitCapability;
        });
        const inferred = inferScopeAnswersFromDescription(jobDescription, scoped);
        if (Object.keys(inferred).length > 0) {
            setAnswers((prev) => ({ ...inferred, ...prev }));
        }
        prefilledVisitIdsRef.current.add(vid);
    }, [currentVisit, jobDescription]);

    const questions = currentVisit ? buildQuestionsFromVisit(currentVisit) : [];
    const visitCapability = String(currentVisit?.required_capability_tags?.[0] || '').toUpperCase();
    const scopedQuestions = questions.filter((q) => {
        if (!q.capability_tag || !visitCapability) return true;
        return String(q.capability_tag).toUpperCase() === visitCapability;
    });

    const pricingQuestions = scopedQuestions.filter((q) => q.clarifier_type !== 'SAFETY' && q.affects_time !== false);
    const pricingQuestionIds = new Set(pricingQuestions.map((q) => q.id));
    const safetyQuestions = scopedQuestions.filter(
        (q) =>
            !pricingQuestionIds.has(q.id) &&
            (q.clarifier_type === 'SAFETY' || q.affects_time === false || q.affects_safety),
    );

    const needsClarifierGate = scopedQuestions.length > 0;
    const showClarifierOnly = needsClarifierGate && !clarifierPhaseDone;
    const showPriceAndPhotos = !showClarifierOnly;

    const allClarifiersAnswered = scopedQuestions.every((q) => {
        const a = answers[q.id];
        return a !== undefined && String(a).trim() !== '';
    });

    const descriptionTrimmed = scopeDescription.trim();
    const descriptionValid = descriptionTrimmed.length >= MIN_SCOPE_DESCRIPTION_CHARS;

    useEffect(() => {
        if (!currentVisit) return;
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
            priceBefore: Number(currentVisit?.display_price),
            priceAfter: Number(currentVisit?.display_price),
        });
    }, [currentVisit, currentVisitIndex]);

    useEffect(() => {
        if (!currentVisit) return;
        const visitId = currentVisit?.visit_id || currentVisit?.id;
        if (!visitId) return;

        const shouldFetch =
            !needsClarifierGate || clarifierPhaseDone || Object.keys(answers).length > 0;
        if (!shouldFetch) return;

        let mounted = true;
        const run = async () => {
            try {
                const res = await fetch(`/api/visits/${visitId}/scope-lock/preview`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ answers }),
                });
                if (!res.ok) return;
                const data = await res.json();
                if (!mounted) return;
                if (data.status === 'OVERFLOW') {
                    setPreview({
                        status: 'OVERFLOW',
                        bookingAllowed: false,
                        nextStep: data.nextStep || 'REVIEW',
                        message:
                            data.message ||
                            "This job looks more complex than a standard booking. We'll review it and share a custom quote shortly.",
                        eta: data.eta || '30-60 minutes',
                        overflowDelta: Number(data.overflow_delta || 0),
                        minutesBefore: Number(data.minutes_before ?? currentVisit.total_minutes ?? 0),
                        minutesAfter: Number(data.minutes_after ?? currentVisit.total_minutes ?? 0),
                        tierBefore: data.tier_before ?? currentVisit.tier,
                        tierAfter: data.max_ladder ?? currentVisit.tier,
                        priceBefore: Number(data.display_price),
                        priceAfter: Number(data.display_price),
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
                    priceBefore: Number(data.price_before ?? data.display_price),
                    priceAfter: Number(data.price_after ?? data.display_price),
                });
            } catch {
                // Keep latest known preview on transient errors.
            }
        };
        run();
        return () => {
            mounted = false;
        };
    }, [answers, currentVisit, clarifierPhaseDone, needsClarifierGate]);

    if (!currentVisit) return null;

    const handleAnswer = (qId: string, value: string) => {
        setAnswers((prev) => ({ ...prev, [qId]: value }));
    };

    const handleContinueAfterClarifiers = () => {
        if (!allClarifiersAnswered || preview.status === 'OVERFLOW' || preview.bookingAllowed === false) return;
        setClarifierPhaseDone(true);
    };

    const handleFinalSubmit = async () => {
        if (!descriptionValid) return;
        if (currentVisitIndex === visits.length - 1) {
            setIsSubmitting(true);
            const visitId = currentVisit.visit_id || currentVisit.id;
            await onComplete(visitId, answers, scopePhotos, descriptionTrimmed);
            setIsSubmitting(false);
        } else {
            setCurrentVisitIndex((prev) => prev + 1);
        }
    };

    const removePhoto = (index: number) => {
        setScopePhotos((prev) => prev.filter((_, i) => i !== index));
    };


    const renderQuestionBlock = (q: Question) => (
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
                    className="border-white/10 bg-white/5 py-6 text-lg text-white caret-white placeholder:text-gray-400 focus-visible:ring-blue-500"
                    placeholder="Enter a number..."
                    value={answers[q.id] || ''}
                    onChange={(e) => handleAnswer(q.id, e.target.value)}
                />
            )}

            {q.type === 'text' && (
                <Input
                    className="border-white/10 bg-white/5 py-6 text-lg text-white caret-white placeholder:text-gray-400 focus-visible:ring-blue-500"
                    placeholder="Enter details..."
                    value={answers[q.id] || ''}
                    onChange={(e) => handleAnswer(q.id, e.target.value)}
                />
            )}
        </div>
    );

    return (
        <div className="fixed inset-0 z-50 bg-black flex flex-col pt-12 pb-6 px-6 overflow-y-auto">
            <div className="max-w-md mx-auto w-full space-y-8">
                <div className="space-y-2">
                    <Badge className="bg-blue-600">
                        {showClarifierOnly ? 'Step 2a: Job details' : 'Step 2b: Confirm scope'}
                    </Badge>
                    <h1 className="text-3xl font-bold text-white">
                        {showClarifierOnly ? 'A few quick questions' : 'Confirm scope & photos'}
                    </h1>
                    <p className="text-gray-400">
                        Visit {currentVisitIndex + 1} of {visits.length}:{' '}
                        {currentVisit.primary_job_item?.display_name || currentVisit.primary_job_item?.job_item_id}
                    </p>
                    <div className="text-xs text-gray-500">
                        Detected tasks:{' '}
                        {[
                            currentVisit.primary_job_item?.job_item_id,
                            ...(currentVisit.addon_job_items || []).map((a: any) => a.job_item_id),
                        ]
                            .filter(Boolean)
                            .join(', ')}
                    </div>
                </div>

                <Card className="bg-zinc-900 border-white/10 text-white">
                    <CardContent className="p-6 space-y-6">
                        {showClarifierOnly && (
                            <p className="text-sm text-gray-400">
                                Answer each question so we can size time and price correctly. Next you’ll confirm the
                                estimate, add a short job description (required), and optionally add photos.
                            </p>
                        )}

                        {showPriceAndPhotos && (
                            <>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-white/5 rounded-lg p-3">
                                        <div className="text-xs text-gray-400">Time estimate</div>
                                        <div className="text-lg font-bold">{preview.minutesAfter} min</div>
                                        <div className="text-[11px] text-gray-500">was {preview.minutesBefore} min</div>
                                    </div>
                                    <div className="bg-white/5 rounded-lg p-3">
                                        <div className="text-xs text-gray-400">Price</div>
                                        {(() => {
                                            const displayPrice = Number(preview.priceAfter);
                                            if (!Number.isFinite(displayPrice)) {
                                                console.error('Missing backend display_price', { preview, currentVisit });
                                                return null;
                                            }
                                            return <div className="text-lg font-bold">£{displayPrice.toFixed(2)}</div>;
                                        })()}
                                        <div className="text-[11px] text-gray-500">Tier {preview.tierAfter}</div>
                                    </div>
                                </div>

                                {needsClarifierGate && (
                                    <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-gray-300">
                                        <p className="font-medium text-white mb-2">Your answers</p>
                                        <ul className="space-y-1 text-xs">
                                            {scopedQuestions.map((q) => (
                                                <li key={q.id}>
                                                    <span className="text-gray-500">{q.text}</span>{' '}
                                                    <span className="text-gray-200">{answers[q.id]}</span>
                                                </li>
                                            ))}
                                        </ul>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            className="mt-2 h-auto p-0 text-xs text-blue-400 hover:text-blue-300"
                                            onClick={() => setClarifierPhaseDone(false)}
                                        >
                                            Edit answers
                                        </Button>
                                    </div>
                                )}
                            </>
                        )}

                        {showPriceAndPhotos && (
                            <div className="space-y-2 pt-2 border-t border-white/10">
                                <Label className="text-base font-medium text-white">
                                    Job description <span className="text-red-400">*</span>
                                </Label>
                                <p className="text-[11px] text-gray-400">
                                    Describe the work in your own words so your pro can prepare before arrival.
                                </p>
                                <textarea
                                    className="min-h-[120px] w-full resize-y rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm text-white caret-white placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                    placeholder="Please describe the job in more detail so your pro can prepare properly."
                                    value={scopeDescription}
                                    onChange={(e) => setScopeDescription(e.target.value)}
                                    rows={5}
                                    maxLength={4000}
                                    aria-invalid={!descriptionValid && descriptionTrimmed.length > 0}
                                />
                                <p className="text-[11px] text-gray-500">
                                    Minimum {MIN_SCOPE_DESCRIPTION_CHARS} characters ({descriptionTrimmed.length}/
                                    {MIN_SCOPE_DESCRIPTION_CHARS}).
                                    {!descriptionValid && descriptionTrimmed.length > 0 ? (
                                        <span className="text-amber-400 ml-1">Keep typing to continue.</span>
                                    ) : null}
                                </p>
                            </div>
                        )}

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

                        {showClarifierOnly && pricingQuestions.length > 0 && (
                            <div className="space-y-1">
                                <p className="text-xs uppercase tracking-wide text-blue-300">Scope & pricing</p>
                                <p className="text-[11px] text-gray-400">These answers affect time and price.</p>
                            </div>
                        )}

                        {showClarifierOnly && pricingQuestions.map(renderQuestionBlock)}

                        {showClarifierOnly && safetyQuestions.length > 0 && (
                            <div className="space-y-1 pt-2 border-t border-white/10">
                                <p className="text-xs uppercase tracking-wide text-amber-300">Safety / inspection</p>
                                <p className="text-[11px] text-gray-400">Helps us plan a safe visit.</p>
                            </div>
                        )}

                        {showClarifierOnly && safetyQuestions.map(renderQuestionBlock)}

                        {showPriceAndPhotos && (
                            <div className="pt-4 border-t border-white/10 space-y-4">
                                <div className="flex items-center gap-3 text-sky-300 mb-2 bg-sky-500/10 border border-sky-500/20 p-4 rounded-lg">
                                    <Camera className="w-6 h-6 shrink-0" />
                                    <div className="space-y-0.5">
                                        <p className="text-sm font-medium text-white">Photos recommended</p>
                                        <p className="text-gray-400 text-xs">
                                            Adding photos helps your pro prepare and reduces delays. You can continue
                                            without photos.
                                        </p>
                                    </div>
                                </div>

                                {scopePhotos.length > 0 && (
                                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                        {scopePhotos.map((photo, idx) => (
                                            <div
                                                key={idx}
                                                className="relative flex-shrink-0 w-24 h-24 rounded-lg overflow-hidden border border-white/10"
                                            >
                                                <img src={photo} alt={`Capture ${idx}`} className="w-full h-full object-cover" />
                                                <button
                                                    type="button"
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
                                    onCapture={(photo) => setScopePhotos((prev) => [...prev, photo])}
                                    label={scopePhotos.length > 0 ? 'Add another photo' : 'Take photo'}
                                />

                                {scopePhotos.length > 0 && (
                                    <div className="text-green-500 text-xs flex items-center gap-1">
                                        <CheckCircle2 className="w-3 h-3" />
                                        {scopePhotos.length} photo(s) attached
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <div className="space-y-3">
                    {showClarifierOnly ? (
                        <Button
                            className="w-full py-6 text-lg bg-blue-600 hover:bg-blue-700 font-bold"
                            disabled={
                                !allClarifiersAnswered ||
                                preview.status === 'OVERFLOW' ||
                                preview.bookingAllowed === false
                            }
                            onClick={handleContinueAfterClarifiers}
                        >
                            Continue to price & photos
                        </Button>
                    ) : (
                        <Button
                            className="w-full py-6 text-lg bg-blue-600 hover:bg-blue-700 font-bold"
                            disabled={
                                !allClarifiersAnswered ||
                                !descriptionValid ||
                                isSubmitting ||
                                preview.status === 'OVERFLOW' ||
                                preview.bookingAllowed === false
                            }
                            onClick={handleFinalSubmit}
                        >
                            {isSubmitting
                                ? 'Finalizing...'
                                : preview.status === 'OVERFLOW'
                                  ? 'Requires review'
                                  : currentVisitIndex === visits.length - 1
                                    ? 'Confirm booking'
                                    : 'Next visit'}
                        </Button>
                    )}
                    <Button variant="ghost" className="w-full text-gray-500 hover:text-white" onClick={onCancel}>
                        Cancel booking
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
