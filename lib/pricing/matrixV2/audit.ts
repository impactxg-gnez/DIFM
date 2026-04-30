import { prisma } from '@/lib/prisma';

export interface MatrixV2AuditPayload {
    rawInput: string;
    normalizedInput: string;
    detectedJobIds: string[];
    quantityByJob: Record<string, number>;
    routing: string;
    routingWarnings: string[];
    reviewReason?: string;
    totalPrice: number;
    tier: string;
    clarifierIds: string[];
    minutesEstimated: number;
    clarifierHydrationFromText?: Record<string, string | number>;
    clarifierAnswersEffective?: Record<string, string | number>;
}

export async function persistMatrixV2AuditLog(payload: MatrixV2AuditPayload): Promise<void> {
    try {
        await prisma.auditLog.create({
            data: {
                action: 'MATRIX_V2_PIPELINE',
                entityType: 'MATRIX_V2_EXTRACTION',
                entityId: 'N/A',
                details: JSON.stringify(payload),
                actorId: 'SYSTEM',
            },
        });
    } catch (err) {
        console.error('[MATRIX_V2] Failed to persist audit log:', err);
    }
}
