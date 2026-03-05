import OpenAI from 'openai';
import { prisma } from '@/lib/prisma';
import { excelSource } from './excelLoader';
import { parseJobDescription } from './jobParser';
import { buildVisits, GeneratedVisit } from './visitEngine';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export interface ExtractionPipelineResult {
    jobs: string[];
    visits: GeneratedVisit[];
    price: number;
    clarifiers: Array<{ tag: string; question: string }>;
    aiResult: string[];
    fallbackResult: string[];
}

function buildClarifiers(jobIds: string[]) {
    const allClarifierIds = new Set<string>();
    jobIds.forEach((id) => {
        const item = excelSource.jobItems.get(id);
        item?.clarifier_ids?.forEach((clarifierId) => allClarifierIds.add(clarifierId));
    });

    return Array.from(allClarifierIds).map((id) => ({
        tag: id,
        question: excelSource.clarifierLibrary.get(id) || `Please provide details for ${id}`,
    }));
}

function validateAllowedJobs(candidateIds: string[], allowedJobIds: string[]) {
    const allowed = new Set(allowedJobIds);
    return candidateIds.filter((id) => allowed.has(id));
}

export async function runExtractionPipeline(userInput: string): Promise<ExtractionPipelineResult> {
    const jobItems = Array.from(excelSource.jobItems.values());
    const allowedJobIds = jobItems.map((j) => j.job_item_id);

    let aiResult: string[] = [];
    let fallbackResult: string[] = [];

    try {
        if (process.env.OPENAI_API_KEY) {
            const completion = await openai.chat.completions.create({
                model: 'gpt-4o',
                temperature: 0,
                response_format: {
                    type: 'json_schema',
                    json_schema: {
                        name: 'job_extraction',
                        schema: {
                            type: 'object',
                            properties: {
                                detected_jobs: {
                                    type: 'array',
                                    items: {
                                        type: 'string',
                                        enum: allowedJobIds,
                                    },
                                },
                            },
                            required: ['detected_jobs'],
                            additionalProperties: false,
                        },
                    },
                },
                messages: [
                    {
                        role: 'system',
                        content: `You are a structured service request parser.

Your job is to map a customer request to internal DIFM job identifiers.

Rules:
- Only return job_item_ids from the provided list
- If multiple tasks are mentioned return multiple jobs
- Choose the most specific job
- Return JSON only
- Format: { detected_jobs: [job_item_id] }`,
                    },
                    {
                        role: 'user',
                        content: `allowed_jobs: ${JSON.stringify(allowedJobIds)}
userInput: ${userInput}`,
                    },
                ],
            });

            const content = completion.choices[0]?.message?.content || '{"detected_jobs":[]}';
            const parsed = JSON.parse(content);
            aiResult = validateAllowedJobs(
                Array.isArray(parsed?.detected_jobs) ? parsed.detected_jobs : [],
                allowedJobIds
            );
        }
    } catch (err) {
        console.error('[Extraction] GPT-4o extraction failed:', err);
    }

    if (aiResult.length === 0) {
        const parsedFallback = await parseJobDescription(userInput, excelSource.jobItemRules);
        fallbackResult = validateAllowedJobs(parsedFallback.detectedItemIds, allowedJobIds);
    }

    const finalJobs = aiResult.length > 0 ? aiResult : fallbackResult;
    const visits = buildVisits(finalJobs);
    const price = visits.reduce((sum, v) => sum + v.price, 0);
    const clarifiers = buildClarifiers(finalJobs);

    const logPayload = {
        userInput,
        ai_result: aiResult,
        fallback_result: fallbackResult,
        final_jobs: finalJobs,
        final_price: price,
    };

    console.log('[Extraction]', logPayload);

    try {
        await prisma.auditLog.create({
            data: {
                action: 'AI_EXTRACTION',
                entityType: 'EXTRACTION',
                entityId: 'N/A',
                details: JSON.stringify(logPayload),
                actorId: 'SYSTEM',
            },
        });
    } catch (err) {
        console.error('[Extraction] Failed to persist extraction audit log:', err);
    }

    return {
        jobs: finalJobs,
        visits,
        price,
        clarifiers,
        aiResult,
        fallbackResult,
    };
}
