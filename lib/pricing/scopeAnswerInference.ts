import { parseTvDetails } from './bookingSignals';
import { preprocessBookingInput } from './inputPreprocess';

/** Browser-safe mirror of intentMapper.normalizeInput (avoid importing intentMapper → visitEngine → excel fs). */
function normalizeInputForInference(input: string): string {
    return preprocessBookingInput(input)
        .toLowerCase()
        .replace(/\+/g, ' and ')
        .replace(/&/g, ' and ')
        .replace(/;/g, ' and ')
        .replace(/,/g, ' and ')
        .replace(/\s+/g, ' ')
        .trim();
}

export type InferenceQuestion = {
    id: string;
    text: string;
    type: 'boolean' | 'select' | 'number' | 'text';
    options?: string[];
};

function norm(s: string) {
    return s.trim().toLowerCase();
}

/**
 * Match a select option label to material words in the customer description.
 */
function inferWallSelect(
    options: string[],
    textNorm: string,
    wallKeyword: string | null,
): string | undefined {
    const t = textNorm;
    const rows: Array<{ test: RegExp; hints: string[] }> = [
        { test: /\bbrick\b/, hints: ['brick'] },
        { test: /\bconcrete\b/, hints: ['concrete'] },
        { test: /\b(tile|tiled)\b/, hints: ['tile'] },
        { test: /\b(drywall|plasterboard|plaster)\b/, hints: ['plasterboard', 'drywall', 'plaster'] },
        { test: /\b(wood|stud)\b/, hints: ['wood', 'stud'] },
    ];
    for (const { test, hints } of rows) {
        const matchedText = test.test(t);
        const matchedKw = wallKeyword && hints.some((h) => wallKeyword.includes(h));
        if (!matchedText && !matchedKw) continue;
        const opt = options.find((o) => {
            const ol = norm(o);
            return hints.some((h) => ol.includes(h));
        });
        if (opt) return opt;
    }
    for (const o of options) {
        const ol = norm(o);
        if (ol.length >= 4 && t.includes(ol)) return o;
    }
    return undefined;
}

function inferHeightBoolean(textNorm: string): 'yes' | 'no' | undefined {
    if (/\babove\b.{0,40}\b2\.?\s*5|over\s+2\.?\s*5|high\s+ceiling|vaulted|tall\s+wall/i.test(textNorm))
        return 'yes';
    if (/\bstandard\s+height|below\s+2\.?\s*5|normal\s+ceiling|not\s+high\b/i.test(textNorm)) return 'no';
    return undefined;
}

/**
 * Prefill Scope Lock clarifiers from the free-text booking description.
 * Answers remain editable in the UI.
 */
export function inferScopeAnswersFromDescription(
    rawDescription: string,
    questions: InferenceQuestion[],
): Record<string, string> {
    const textNorm = normalizeInputForInference(rawDescription || '');
    const plain = rawDescription || '';
    const tv = parseTvDetails(plain);
    const out: Record<string, string> = {};

    for (const q of questions) {
        const id = q.id.toUpperCase();
        const qt = norm(q.text);

        if (q.type === 'number') {
            if ((id.includes('TV') && id.includes('INCH')) || (qt.includes('tv') && qt.includes('inch'))) {
                if (tv.size != null) out[q.id] = String(tv.size);
            } else if (id.includes('SHELF') && (id.includes('COUNT') || qt.includes('how many'))) {
                const m = plain.match(/\b(\d+)\s*(?:shelf|shelves)\b/i);
                if (m) out[q.id] = String(Number(m[1]));
            }
            continue;
        }

        if (q.type === 'boolean') {
            const isCable =
                id.includes('CABLE') || id.includes('CONCEAL') || /conceal/.test(qt) || /cables?\s+conceal/i.test(plain);
            if (isCable) {
                if (tv.concealed === true) out[q.id] = 'yes';
                else if (tv.concealed === false) out[q.id] = 'no';
            } else if (
                id.includes('HEIGHT') ||
                /2\.5|ceiling height|above standard|over 2/i.test(q.text)
            ) {
                const h = inferHeightBoolean(textNorm);
                if (h) out[q.id] = h;
            }
            continue;
        }

        if (q.type === 'select' && q.options?.length) {
            const wallQ =
                id === 'WALL_TYPE' ||
                (/wall/i.test(q.text) && /material|drilling|type|surface/i.test(q.text));
            if (wallQ) {
                const pick = inferWallSelect(q.options, textNorm, tv.wall);
                if (pick) out[q.id] = pick;
            }
            continue;
        }
    }

    return out;
}
