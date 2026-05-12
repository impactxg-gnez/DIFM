/**
 * 4-stage intent classification telemetry + confidence (Matrix V2 + review leads).
 */

import type { MatrixV2ParserTrace, ParserStageUsed } from './bookingRoutingTypes';

export type ConfidenceLabel = 'HIGH' | 'MEDIUM' | 'LOW' | 'BLOCKED';

/** Map string for admin + logs — not an enum constraint on DB yet. */
export function numericConfidence(conf: ConfidenceLabel): number {
    switch (conf) {
        case 'HIGH':
            return 1;
        case 'MEDIUM':
            return 0.62;
        case 'LOW':
            return 0.28;
        case 'BLOCKED':
            return 0;
        default:
            return 0.3;
    }
}

export function deriveParserStageFromTrace(trace: MatrixV2ParserTrace | undefined, hadJobMatch: boolean): ParserStageUsed {
    if (!hadJobMatch) return 'none';
    if (!trace) return 'keyword';
    switch (trace.resolution) {
        case 'phrase':
            return 'exact';
        case 'phrase_flex':
            return 'flex';
        case 'keyword':
            return 'keyword';
        case 'phrase+keyword':
        case 'mixed':
            return 'flex';
        default:
            return 'none';
    }
}

/**
 * When Matrix V2 has no priced job: infer whether this is a review lead with a coarse category.
 */
export function inferReviewLeadFromText(normalizedMatrixStyle: string): {
    inferredCategory: string;
    confidence: ConfidenceLabel;
} | null {
    const n = normalizedMatrixStyle;
    if (/\b(dog|cat)\b.*\bwalk(?:ing)?\b|\bwalk(?:ing)?\b.*\b(my|the|a|your)\s+dog\b|\bdog\s+walk(?:er|ing)?\b/i.test(n)) {
        return { inferredCategory: 'PET_LIFESTYLE', confidence: 'MEDIUM' };
    }
    if (/\bpet\s+sitt(?:ing|er)\b|\bcat\s+sitt(?:ing|er)\b|\bhouse\s+sit.*\bpet\b/i.test(n)) {
        return { inferredCategory: 'PET_LIFESTYLE', confidence: 'MEDIUM' };
    }
    if (
        /\bappliance(s)?\b.{0,40}\b(repair|repairs|service|servicing|fix|fixed|broken)\b/i.test(n) ||
        /\b(repair|fix|service)\b.{0,30}\b(kitchen\s+)?appliances?\b/i.test(n) ||
        /\bneed\b.{0,20}\bappliance\b.{0,20}\b(repair|service|fix)\b/i.test(n)
    ) {
        return { inferredCategory: 'APPLIANCE', confidence: 'MEDIUM' };
    }
    if (/\bneed\s+a?\s*handyman\b|\bgeneral\s+handyman\b|\bhandyman\s+for\b/i.test(n)) {
        return { inferredCategory: 'HANDYMAN', confidence: 'MEDIUM' };
    }
    return null;
}

export function confidenceForResolvedJob(
    trace: MatrixV2ParserTrace | undefined,
    resolution: MatrixV2ParserTrace['resolution'],
): ConfidenceLabel {
    if (resolution === 'phrase') return 'HIGH';
    if (resolution === 'phrase_flex') return 'HIGH';
    if (resolution === 'phrase+keyword' || resolution === 'mixed') return 'MEDIUM';
    if (resolution === 'keyword') return 'MEDIUM';
    return 'LOW';
}
