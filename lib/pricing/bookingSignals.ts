/**
 * Shared text signals for extraction + clarifier gating (no dependency on intent rules).
 */

export function parseTvDetails(input: string): {
    size: number | null;
    wall: string | null;
    concealed: boolean | null;
} {
    const sizeMatch = input.match(/\b(\d{2,3})\s*(?:inch|inches|")\b/i) || input.match(/\b(\d{2,3})\b(?=\s*tv)/i);
    const wallMatch = input.match(/\b(concrete|brick|drywall|plaster|wood|stud)\b/i);
    const concealment =
        /\b(conceal(?:ed)?|hide|hidden)\b.*\b(cable|cables|wire|wires)\b/i.test(input) ||
        /\b(cable|cables|wire|wires)\b.*\b(conceal(?:ed)?|hide|hidden)\b/i.test(input);
    return {
        size: sizeMatch ? Number(sizeMatch[1]) : null,
        wall: wallMatch ? wallMatch[1].toLowerCase() : null,
        concealed: concealment ? true : null,
    };
}

export function parseCurtainLengthMeters(part: string): number | null {
    const meter = part.match(/\b(\d+(?:\.\d+)?)\s*(m|meter|meters)\b/i);
    if (meter) return Number(meter[1]);
    const cm = part.match(/\b(\d{2,4})\s*(cm)\b/i);
    if (cm) return Number(cm[1]) / 100;
    return null;
}

export function hasExplicitQuantitySignal(part: string): boolean {
    return (
        /\b\d+\b/.test(part) ||
        /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/i.test(
            part,
        ) ||
        /\bpair\s+of\b/i.test(part) ||
        /\b\d+\s*x\b/i.test(part) ||
        /\bx\s*\d+\b/i.test(part)
    );
}

export function wallMaterialMentioned(text: string): boolean {
    return /\b(concrete|brick|drywall|plaster|wood|stud)\b/i.test(text);
}

export function shelfQuantityProvidedInDescription(normalizedInput: string): boolean {
    const parts = normalizedInput.split(' and ');
    return parts.some((p) => /\b(shelf|shelves)\b/i.test(p) && hasExplicitQuantitySignal(p));
}

export function curtainLengthProvidedInDescription(normalizedInput: string): boolean {
    const parts = normalizedInput.split(' and ');
    return parts.some((p) => parseCurtainLengthMeters(p) !== null);
}

export function ceilingCurtainMountMentioned(text: string): boolean {
    return (
        /\b(ceiling|ceiling-mounted)\b/i.test(text) &&
        /\b(curtain|rail|pole|track|rod)\b/i.test(text)
    );
}

export function flatpackStatusMentioned(text: string): boolean {
    return /\b(boxed|flat\s*pack|flatpack|still\s+in\s+(the\s+)?box|unopened)\b/i.test(text);
}

export function furnitureSizeMentioned(text: string): boolean {
    return /\b(small|medium|large|oversized|huge|big|wardrobe|pax|billy|hemnes|malm)\b/i.test(text);
}

export function blindWindowContextMentioned(text: string): boolean {
    return /\b(bay|patio|french|bifold|skylight|large\s+window|wide\s+window|floor\s*to\s*ceiling)\b/i.test(
        text,
    );
}
