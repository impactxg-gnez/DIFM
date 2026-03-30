export type UiTier = 'H1' | 'H2' | 'H3';

const VALID_UI_TIERS = new Set<UiTier>(['H1', 'H2', 'H3']);

function normalizeTierToken(raw: string): string {
  return raw.trim().toUpperCase();
}

export function normalizeTier(tier: unknown): UiTier {
  const raw = typeof tier === 'string' ? normalizeTierToken(tier) : '';

  if (VALID_UI_TIERS.has(raw as UiTier)) {
    return raw as UiTier;
  }

  console.error('Invalid tier received from backend', tier);

  // Transitional values like "E2 → H3" or "E2 -> H3"
  if (raw.includes('→') || raw.includes('->')) {
    const parts = raw.split(/→|->/).map((p) => normalizeTierToken(p)).filter(Boolean);
    const rightMost = parts[parts.length - 1];
    if (rightMost && VALID_UI_TIERS.has(rightMost as UiTier)) {
      return rightMost as UiTier;
    }
    if (rightMost === 'E1') return 'H1';
    if (rightMost === 'E2') return 'H2';
    if (rightMost === 'E3') return 'H3';
  }

  // Legacy/internal ladder values
  if (raw === 'E1') return 'H1';
  if (raw === 'E2') return 'H2';
  if (raw === 'E3') return 'H3';

  return 'H1';
}

export function normalizeVisitForUi<T extends Record<string, any> | null | undefined>(visit: T): T {
  if (!visit || typeof visit !== 'object') return visit;
  const sourcePrice = (visit as any).display_price ?? (visit as any).price;
  return {
    ...visit,
    tier: normalizeTier((visit as any).tier),
    display_price: Number.isFinite(Number(sourcePrice)) ? Number(sourcePrice) : null,
  } as T;
}

export function normalizeJobForUi<T extends Record<string, any> | null | undefined>(job: T): T {
  if (!job || typeof job !== 'object') return job;
  const sourcePrice = (job as any).display_price ?? (job as any).fixedPrice;
  return {
    ...job,
    display_price: Number.isFinite(Number(sourcePrice)) ? Number(sourcePrice) : null,
    visits: Array.isArray((job as any).visits)
      ? (job as any).visits.map((visit: any) => normalizeVisitForUi(visit))
      : (job as any).visits,
  } as T;
}
