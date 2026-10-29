import { ReferenceEntry } from "@/lib/references/types";

/**
 * Indonesian regulations, ministerial decrees and SNI standards.
 *
 * No free API publishes machine-readable metadata for these, and this module
 * refuses to pretend otherwise: nothing here confirms that a regulation
 * exists. What can be established without guessing is whether the citation is
 * *internally* coherent — whether it carries a number, a year and a subject at
 * all, whether the year in the instrument's own designation agrees with the
 * year the entry was published under, and whether that year is in the future.
 *
 * That is a narrower claim than "this regulation is real", and it is reported
 * as such. It still catches the two things worth catching: a citation too
 * incomplete for a reader to look up, and a fabricated one assembled with
 * mismatched or impossible numbers.
 */

export interface RegulationStructure {
  number: string | null;
  year: string | null;
  hasSubject: boolean;
  /** Problems found, phrased for a reviewer. Empty means internally coherent. */
  problems: string[];
}

const NUMBER_PATTERN = /\b(?:nomor|number|no)\.?\s*([0-9]+(?:\s*\/\s*[A-Za-z0-9.\-/]+)*)/i;

/** "Tahun 2017", "of 2025", "year 2017". */
const LABELLED_YEAR_PATTERN = /\b(?:tahun|of|year)\s*((?:19|20)\d{2})\b/i;

/** The compact "14/PRT/M/2017" or "12/2025" designation. */
const SLASHED_YEAR_PATTERN = /\b\d+\s*\/(?:[A-Za-z0-9.\-]+\/)*\s*((?:19|20)\d{2})\b/;

const SUBJECT_PATTERN = /\b(tentang|concerning|regarding|on\s+the)\b/i;

export function analyzeRegulation(entry: ReferenceEntry): RegulationStructure {
  const text = entry.rawText;

  const numberMatch = text.match(NUMBER_PATTERN);
  const labelledYear = text.match(LABELLED_YEAR_PATTERN);
  const slashedYear = text.match(SLASHED_YEAR_PATTERN);

  const number = numberMatch ? numberMatch[1].replace(/\s+/g, "") : null;
  const year = labelledYear?.[1] ?? slashedYear?.[1] ?? null;
  const hasSubject = SUBJECT_PATTERN.test(text);

  const problems: string[] = [];

  if (!number) {
    problems.push("tidak mencantumkan nomor peraturan");
  }
  if (!year) {
    problems.push("tidak mencantumkan tahun peraturan");
  }
  if (!hasSubject) {
    problems.push('tidak mencantumkan perihal ("tentang ...")');
  }

  if (year) {
    const numericYear = Number(year);
    // Compared against the clock rather than a hardcoded year so this does not
    // quietly stop working, and only flagged a full year ahead: a regulation
    // promulgated late in the year is routinely cited at the turn of the next.
    const nextYear = new Date().getFullYear() + 1;
    if (numericYear > nextYear) {
      problems.push(`tahun peraturan (${year}) melewati tahun berjalan`);
    }

    // The entry's own author-date year should be the regulation's year. A
    // disagreement means one of the two numbers is wrong, which is exactly the
    // shape a fabricated legal citation takes.
    if (entry.year && entry.year !== year) {
      problems.push(
        `tahun terbit yang dikutip (${entry.year}) berbeda dari tahun peraturan (${year})`,
      );
    }
  }

  return { number, year, hasSubject, problems };
}
