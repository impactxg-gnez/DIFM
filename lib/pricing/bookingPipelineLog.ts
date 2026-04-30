import { prisma } from '@/lib/prisma';
import { normalizeTier } from './tierNormalization';
import type { ExtractionPipelineResult } from './extractionEngine';
import type { BookingRouting } from './bookingRoutingTypes';

/** Narrow slice passed from v1Pricing (avoids circular import with v1Pricing). */
export interface BookingPipelinePricingResultSlice {
    visits: Array<{ tier?: string | null }>;
    totalPrice: number;
    quantitiesByJob?: Record<string, number>;
    clarifier_answers?: Record<string, string | number>;
    clarifier_hydration?: Record<string, string | number>;
    routing: BookingRouting;
    warnings?: string[];
    isOutOfScope?: boolean;
    pipeline?: 'MATRIX_V2' | 'LEGACY' | null;
}

/** Human-facing routing label (API / admin). */
export function routingLabelForLog(routing: BookingRouting): 'FIXED' | 'REVIEW_QUOTE' | 'REJECT' {
    if (routing === 'FIXED_PRICE') return 'FIXED';
    if (routing === 'REJECT') return 'REJECT';
    return 'REVIEW_QUOTE';
}

/**
 * Prefer matrix / visit primary IDs over legacy canonical job names.
 */
export function deriveJobItemIdsFromExtraction(extraction: ExtractionPipelineResult | null | undefined): string[] {
    if (!extraction) return [];
    const ordered = new Set<string>();
    for (const v of extraction.visits ?? []) {
        const p = v.primary_job_item?.job_item_id;
        if (p) ordered.add(p);
        for (const a of v.addon_job_items ?? []) {
            if (a.job_item_id) ordered.add(a.job_item_id);
        }
    }
    if (ordered.size > 0) return [...ordered];
    for (const d of extraction.jobDetails ?? []) {
        if (d.pricingJobId) ordered.add(d.pricingJobId);
    }
    if (ordered.size > 0) return [...ordered];
    if (extraction.pipeline === 'MATRIX_V2' && extraction.jobs?.length) {
        return [...new Set(extraction.jobs)];
    }
    const qb = extraction.mappingMeta?.quantityByJob;
    if (qb && Object.keys(qb).length > 0) {
        return Object.keys(qb);
    }
    return [];
}

export interface PersistBookingPipelineLogArgs {
    description: string;
    extraction: ExtractionPipelineResult | null | undefined;
    result: BookingPipelinePricingResultSlice;
}

export async function persistBookingPipelineLog(args: PersistBookingPipelineLogArgs): Promise<void> {
    const { description, extraction, result } = args;
    const job_item_ids = deriveJobItemIdsFromExtraction(extraction);
    const quantities_by_job = { ...(result.quantitiesByJob ?? {}) };
    const primaryQty =
        job_item_ids.length === 1 ? quantities_by_job[job_item_ids[0]] : undefined;

    const tierFromVisits =
        result.visits?.length === 1 ? normalizeTier(result.visits[0]?.tier ?? '') : undefined;
    const tierFromExtraction = extraction?.tier ? normalizeTier(extraction.tier) : undefined;
    const tier = tierFromVisits ?? tierFromExtraction ?? 'H1';

    const payload = {
        version: 2 as const,
        input: description,
        parsed: {
            job_item_ids,
            quantities_by_job,
            ...(primaryQty !== undefined ? { quantity: primaryQty } : {}),
            pipeline: result.isOutOfScope
                ? ('OUT_OF_SCOPE' as const)
                : (result.pipeline ?? extraction?.pipeline ?? null),
            total_minutes: extraction?.total_minutes ?? null,
            ...(extraction?.mappingMeta?.matrixV2?.parser
                ? { parser_trace: extraction.mappingMeta.matrixV2.parser }
                : {}),
        },
        clarifier_answers: { ...(result.clarifier_answers ?? {}) },
        clarifier_hydration: { ...(result.clarifier_hydration ?? {}) },
        routing: routingLabelForLog(result.routing),
        routing_detail: result.routing,
        pricing: {
            tier,
            price: Number(result.totalPrice ?? 0),
        },
        warnings: result.warnings ?? [],
        is_out_of_scope: !!result.isOutOfScope,
        display_price: Number(result.totalPrice ?? 0),
    };

    try {
        await prisma.auditLog.create({
            data: {
                action: 'BOOKING_PIPELINE',
                entityType: 'PRICING_INPUT',
                entityId: 'N/A',
                details: JSON.stringify(payload),
                actorId: 'SYSTEM',
            },
        });
    } catch (err) {
        console.error('[BOOKING_PIPELINE] Failed to persist audit log:', err);
    }
}
