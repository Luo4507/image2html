export interface TextCoverageResult {
  originalCount: number;
  matchedCount: number;
  coverage: number;
  missing: string[];
}

function normalizeText(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

export function calculateTextCoverage(
  originalTexts: string[],
  generatedCode: string
): TextCoverageResult {
  let remaining = normalizeText(generatedCode);
  const matchedIndexes = new Set<number>();
  const candidates = originalTexts
    .map((text, index) => ({ text, index, normalized: normalizeText(text) }))
    .filter((candidate) => candidate.normalized)
    .sort((a, b) => b.normalized.length - a.normalized.length);

  for (const candidate of candidates) {
    const matchIndex = remaining.indexOf(candidate.normalized);
    if (matchIndex < 0) continue;

    matchedIndexes.add(candidate.index);
    remaining = `${remaining.slice(0, matchIndex)}${'\0'.repeat(candidate.normalized.length)}${remaining.slice(matchIndex + candidate.normalized.length)}`;
  }

  const missing = originalTexts.filter((text, index) =>
    normalizeText(text) && !matchedIndexes.has(index)
  );
  const matchedCount = matchedIndexes.size;

  return {
    originalCount: originalTexts.length,
    matchedCount,
    coverage: originalTexts.length
      ? Math.round((matchedCount / originalTexts.length) * 10000) / 100
      : 100,
    missing,
  };
}
