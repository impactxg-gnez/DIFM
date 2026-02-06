import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { CheckCircle2, AlertCircle, Camera, Check, X } from 'lucide-react';

interface ScopeLockProps {
    visits: any[];
    onComplete: (visitId: string, answers: any) => void;
    onCancel: () => void;
}

export function ScopeLock({ visits, onComplete, onCancel }: ScopeLockProps) {
    const [currentVisitIndex, setCurrentVisitIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    const currentVisit = visits[currentVisitIndex];

    if (!currentVisit) return null;

    interface Question {
        id: string;
        text: string;
        type: 'YES_NO_NOTSURE' | 'YES_NO' | 'CHOICE';
        options?: string[];
    }

    // Question patterns from spec
    const getQuestions = (visit: any): Question[] => {
        // In V1, we derive questions from the primary item's uncertainty profile
        // This is a simplified mapper
        const questions: Question[] = [
            {
                id: 'visible_accessible',
                text: 'Is the area fully visible and accessible without removing panels or furniture?',
                type: 'YES_NO_NOTSURE'
            }
        ];

        const primaryId: string = visit?.primary_job_item?.job_item_id || '';

        if (primaryId.includes('tv')) {
            questions.push({
                id: 'bracket_provided',
                text: 'Do you have the correct bracket and fixings for your wall type?',
                type: 'YES_NO'
            });
        }

        if (primaryId.includes('leak') || primaryId.includes('toilet')) {
            questions.push({
                id: 'location',
                text: 'Where is the issue located?',
                type: 'CHOICE',
                options: ['Under sink', 'Floor level', 'Concealed/Wall', 'Outside']
            });
        }

        return questions;
    };


    const questions = getQuestions(currentVisit);

    const handleAnswer = (qId: string, value: string) => {
        setAnswers(prev => ({ ...prev, [qId]: value }));
    };

    const handleNext = async () => {
        // If last visit, submit
        if (currentVisitIndex === visits.length - 1) {
            setIsSubmitting(true);
            await onComplete(currentVisit.id, answers);
            setIsSubmitting(false);
        } else {
            setCurrentVisitIndex(prev => prev + 1);
            // We'd ideally reset answers per visit or keep them grouped
        }
    };

    const isAllAnswered = questions.every(q => answers[q.id]);

    return (
        <div className="fixed inset-0 z-50 bg-black flex flex-col pt-12 pb-6 px-6 overflow-y-auto">
            <div className="max-w-md mx-auto w-full space-y-8">
                <div className="space-y-2">
                    <Badge className="bg-blue-600">Step 2: Scope Lock</Badge>
                    <h1 className="text-3xl font-bold text-white">Confirm Details</h1>
                    <p className="text-gray-400">
                        Visit {currentVisitIndex + 1} of {visits.length}: {currentVisit.primary_job_item?.display_name || currentVisit.primary_job_item?.job_item_id}
                    </p>
                </div>

                <Card className="bg-zinc-900 border-white/10 text-white">
                    <CardContent className="p-6 space-y-6">
                        {questions.map((q) => (
                            <div key={q.id} className="space-y-4">
                                <Label className="text-lg font-medium leading-tight">{q.text}</Label>

                                {q.type === 'YES_NO_NOTSURE' && (
                                    <div className="grid grid-cols-3 gap-2">
                                        {['yes', 'no', 'not_sure'].map((val) => (
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

                                {q.type === 'YES_NO' && (
                                    <div className="grid grid-cols-2 gap-2">
                                        {['yes', 'no'].map((val) => (
                                            <Button
                                                key={val}
                                                variant={answers[q.id] === val ? 'default' : 'outline'}
                                                className={`capitalize ${answers[q.id] === val ? 'bg-blue-600' : 'border-white/10 hover:bg-white/5'}`}
                                                onClick={() => handleAnswer(q.id, val)}
                                            >
                                                {val}
                                            </Button>
                                        ))}
                                    </div>
                                )}

                                {q.type === 'CHOICE' && (
                                    <div className="grid grid-cols-2 gap-2">
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
                            </div>
                        ))}

                        <div className="pt-4 border-t border-white/10">
                            <div className="flex items-center gap-3 text-blue-400 mb-4 bg-blue-400/10 p-4 rounded-lg">
                                <Camera className="w-6 h-6 shrink-0" />
                                <p className="text-sm font-medium">Add a photo of the area (Optional but recommended)</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <div className="space-y-3">
                    <Button
                        className="w-full py-6 text-lg bg-blue-600 hover:bg-blue-700 font-bold"
                        disabled={!isAllAnswered || isSubmitting}
                        onClick={handleNext}
                    >
                        {isSubmitting ? 'Finalizing...' : (currentVisitIndex === visits.length - 1 ? 'Confirm & Book' : 'Next Visit')}
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
