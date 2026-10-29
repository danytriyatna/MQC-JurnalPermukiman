/**
 * Reference verification — checking whether each entry in a manuscript's
 * bibliography describes a work that actually exists.
 *
 * The guiding constraint for this whole module: Jurnal Permukiman cites a lot
 * of Indonesian local journals, ministry regulations, SNI standards and grey
 * literature that no open bibliographic API indexes. "Not found in Crossref"
 * therefore carries almost no evidence of fabrication, and a verdict that
 * conflated the two would accuse honest authors. So the verdict is graded, and
 * only `doi_invalid` is presented as a strong fabrication signal — a DOI is
 * minted by a registrar, so one that resolves nowhere was almost certainly
 * invented, which is the signature failure mode of AI-hallucinated citations.
 */

export type ReferenceKind = "journal" | "book" | "regulation" | "web" | "unknown";

export type ReferenceVerdict =
  /** Found in a bibliographic registry, title/year/author agree. */
  | "verified"
  /** A DOI is printed but no registrar knows it. Strong fabrication signal. */
  | "doi_invalid"
  /** The work exists but the entry misstates its year, authors or title. */
  | "metadata_mismatch"
  /** A cited web page no longer resolves. Rot, not necessarily invention. */
  | "url_unreachable"
  /** Regulation citation is internally inconsistent (e.g. year disagrees). */
  | "regulation_inconsistent"
  /** Searched and found nothing. NOT evidence of fabrication. */
  | "not_found"
  /** No source covers this kind of work; never searched. */
  | "not_verifiable"
  /** The lookup itself failed (network, rate limit). Retryable. */
  | "check_failed";

export type VerdictConfidence = "high" | "medium" | "low";

export interface ReferenceEntry {
  /** 1-based position in the reference list, as a reviewer would count it. */
  entryIndex: number;
  rawText: string;
  kind: ReferenceKind;
  doi: string | null;
  url: string | null;
  isbn: string | null;
  authorSurnames: string[];
  year: string | null;
  /** Best-effort title, used for similarity scoring and title-based search. */
  title: string | null;
}

export type MatchSource =
  | "crossref"
  | "openalex"
  | "openlibrary"
  | "url"
  | "structure";

export interface ReferenceMatch {
  source: MatchSource;
  title: string | null;
  year: string | null;
  authors: string[];
  url: string | null;
  /** 0..1 Dice coefficient over title bigrams. */
  titleSimilarity: number;
}

export interface ReferenceCheckResult {
  entry: ReferenceEntry;
  verdict: ReferenceVerdict;
  confidence: VerdictConfidence;
  match: ReferenceMatch | null;
  /** Reviewer-facing explanation, in Indonesian. */
  note: string;
}

/**
 * Bumped whenever the sources or thresholds change, so a stored run can be
 * read back knowing which logic produced it — the same role
 * RULE_SET_VERSION plays for screening.
 */
export const REFERENCE_SOURCE_SET_VERSION = "crossref+openalex+openlibrary-v1";
