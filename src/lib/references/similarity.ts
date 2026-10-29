/**
 * Title comparison for reference matching.
 *
 * A bibliographic search engine will happily return a plausible-looking but
 * different paper for a query it cannot satisfy, so a returned candidate is
 * only treated as "the same work" once its title agrees with the cited one.
 * Dice over character bigrams is used rather than token overlap because it
 * degrades gracefully against the differences that actually show up between a
 * reference list and a registry record: British/American spelling, a dropped
 * subtitle, "and" vs "&", and the title-case mangling common in Indonesian
 * reference lists ("Effect Of Host Country...").
 */

/**
 * Strips everything that varies without changing which work is meant:
 * diacritics, case, punctuation and runs of whitespace.
 */
export function normalizeTitle(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function bigrams(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = 0; i < text.length - 1; i++) {
    const gram = text.slice(i, i + 2);
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  return counts;
}

/**
 * Sørensen–Dice coefficient over character bigrams, 0..1. Returns 0 when
 * either side is too short to form a bigram rather than dividing by zero.
 */
export function titleSimilarity(a: string, b: string): number {
  const left = normalizeTitle(a);
  const right = normalizeTitle(b);

  if (!left || !right) return 0;
  if (left === right) return 1;

  const leftGrams = bigrams(left);
  const rightGrams = bigrams(right);

  let leftTotal = 0;
  for (const n of leftGrams.values()) leftTotal += n;
  let rightTotal = 0;
  for (const n of rightGrams.values()) rightTotal += n;
  if (leftTotal === 0 || rightTotal === 0) return 0;

  let shared = 0;
  for (const [gram, count] of leftGrams) {
    shared += Math.min(count, rightGrams.get(gram) ?? 0);
  }

  return (2 * shared) / (leftTotal + rightTotal);
}

/**
 * A candidate's title has to clear this before the work is called the same
 * one. Set from the observed spread on real entries: genuine matches against
 * Crossref sit well above 0.8 even with case and subtitle differences, while
 * the "nearest plausible paper" a search returns for an unindexed Indonesian
 * article lands far below it.
 */
export const STRONG_TITLE_MATCH = 0.82;

/**
 * Between this and STRONG_TITLE_MATCH the work is probably the one meant but
 * the entry is not quoting it accurately — reported as a mismatch for a human
 * to read, never as fabrication.
 */
export const WEAK_TITLE_MATCH = 0.55;

/**
 * Bigram similarity is unreliable on very short strings — a one-word title
 * like "Information" scores 80% against "Information Flow", which says nothing
 * about them being the same work. Titles below this length are still searched
 * on, but a candidate they return is never graded as a near match.
 */
export const MIN_COMPARABLE_TITLE_CHARS = 25;

export function isComparableTitle(title: string | null): boolean {
  if (!title) return false;
  return (
    title.length >= MIN_COMPARABLE_TITLE_CHARS &&
    normalizeTitle(title).split(" ").filter(Boolean).length >= 3
  );
}

/**
 * Do the cited surnames appear among the registry record's authors? Compared
 * on surname only, and satisfied by the first author alone: reference lists
 * routinely truncate author lists with "et al." and registries disagree about
 * how many authors to store, so requiring full agreement would manufacture
 * mismatches. Returns true when either side lists no authors, since absence
 * of data is not disagreement.
 */
export function authorsAgree(cited: string[], found: string[]): boolean {
  if (cited.length === 0 || found.length === 0) return true;

  const foundNormalized = found.map(normalizeTitle);
  return cited.some((surname) => {
    const needle = normalizeTitle(surname);
    if (!needle) return false;
    return foundNormalized.some(
      (candidate) => candidate === needle || candidate.split(" ").includes(needle),
    );
  });
}
