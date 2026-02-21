import { JobItemRuleExcel } from './excelLoader';

export interface ParseResult {
  detectedItemIds: string[];
  confidence: number;
}

/**
 * PRODUCTION PARSER: Rule-Based Runtime Wiring
 * 1. Tokenize Input (Lowercase, remove punctuation, split by whitespace)
 * 2. Match Rules (include subset OR include/optional intersection AND no exclusion)
 * 3. Return ALL matches
 */

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "") // Remove punctuation
    .split(/\s+/)
    .filter(Boolean);
}

export function matchJobItemRules(tokens: string[], rules: Map<string, JobItemRuleExcel>): string[] {
  const tokenSet = new Set(tokens);
  const detectedIds: string[] = [];

  for (const [id, rule] of rules.entries()) {
    const includeSet = rule.include;
    const optionalSet = rule.optional;
    const excludeSet = rule.exclude;

    // Logic:
    // 1. (include ⊆ tokens)
    // OR
    // 2. ( (include ∩ tokens).length >= 1 AND (optional ∩ tokens).length >= 1 )

    const matchedInclude = includeSet.filter(kw => tokenSet.has(kw));
    const isSubset = includeSet.length > 0 && matchedInclude.length === includeSet.length;

    const matchedOptional = optionalSet.filter(kw => tokenSet.has(kw));

    const meetsInclusion = isSubset || (matchedInclude.length >= 1 && matchedOptional.length >= 1);

    // 3. AND (exclude ∩ tokens).length === 0
    const hasExclude = excludeSet.some(kw => tokenSet.has(kw));

    if (meetsInclusion && !hasExclude) {
      detectedIds.push(id);
    }
  }

  return detectedIds;
}

export async function parseJobDescription(
  text: string,
  rules: Map<string, JobItemRuleExcel>
): Promise<ParseResult> {
  console.log(`[JobParser] Rule-Based Parsing: "${text}"`);

  const tokens = tokenize(text);
  const detectedItemIds = matchJobItemRules(tokens, rules);

  console.log(`[JobParser] Detected IDs:`, detectedItemIds);

  return {
    detectedItemIds,
    confidence: detectedItemIds.length > 0 ? 1.0 : 0
  };
}
