/** Whole-home priced cleans (exclude room-only jobs like bathroom_cleaning). */
export function isWholeHomeCleanJobId(jobItemId: string): boolean {
    const u = String(jobItemId || '').trim().toLowerCase();
    return u === 'home_cleaning' || u === 'home_cleaning_standard' || u === 'home_cleaning_deep';
}

/** Matrix/clarifiers: numeric “rooms/BHK” field is the configured BHK (bedrooms), not beds+hall+kitchen. */
export function cleaningTierBhkFromRoomClarifierValue(val: number): number {
    if (!Number.isFinite(val) || val < 1) return 1;
    return Math.min(4, Math.max(1, Math.round(val)));
}

export function truthyCleaningScopeYes(raw: unknown): boolean {
    const s = String(raw ?? '').trim().toLowerCase();
    return s === 'yes' || s === 'true' || s === '1';
}
