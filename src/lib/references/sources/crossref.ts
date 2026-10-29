import { ReferenceEntry, ReferenceMatch } from "@/lib/references/types";
import { doiCandidates } from "@/lib/references/extractReferences";
import { titleSimilarity } from "@/lib/references/similarity";
import { getJson } from "@/lib/references/sources/http";

/**
 * Crossref — the DOI registration agency for most scholarly publishers,
 * including a large share of Indonesian journals, which register through it.
 * Two different questions are asked of it:
 *
 *   1. Does this exact DOI exist? An authoritative yes/no, and the only
 *      question in this module whose "no" is strong evidence of fabrication.
 *   2. Does a work matching this citation string exist? A ranked guess, never
 *      authoritative, which is why its candidates still have to clear a title
 *      similarity threshold before being believed.
 */

interface CrossrefAuthor {
  family?: string;
  name?: string;
}

interface CrossrefWork {
  DOI?: string;
  title?: string[];
  author?: CrossrefAuthor[];
  issued?: { "date-parts"?: number[][] };
  published?: { "date-parts"?: number[][] };
  URL?: string;
  "container-title"?: string[];
}

const API = "https://api.crossref.org";

function workYear(work: CrossrefWork): string | null {
  const parts = work.issued?.["date-parts"]?.[0] ?? work.published?.["date-parts"]?.[0];
  const year = parts?.[0];
  return year ? String(year) : null;
}

function workAuthors(work: CrossrefWork): string[] {
  return (work.author ?? [])
    .map((a) => a.family ?? a.name ?? "")
    .filter((name) => name.length > 0);
}

function toMatch(work: CrossrefWork, citedTitle: string | null): ReferenceMatch {
  const title = work.title?.[0] ?? null;
  return {
    source: "crossref",
    title,
    year: workYear(work),
    authors: workAuthors(work),
    url: work.DOI ? `https://doi.org/${work.DOI}` : (work.URL ?? null),
    titleSimilarity: citedTitle && title ? titleSimilarity(citedTitle, title) : 0,
  };
}

export type DoiLookup =
  /** The registry served a record for one of the candidate readings. */
  | { status: "found"; match: ReferenceMatch }
  /** Every candidate reading came back 404. The DOI is not registered. */
  | { status: "unregistered" };

/**
 * Resolves a printed DOI, trying each plausible reading of it (see
 * `doiCandidates`) before concluding that none is registered. Throws
 * LookupError if the registry could not be reached, so a network problem is
 * never mistaken for an unregistered DOI.
 */
export async function lookupDoi(
  doi: string,
  citedTitle: string | null,
): Promise<DoiLookup> {
  for (const candidate of doiCandidates(doi)) {
    const body = await getJson<{ message: CrossrefWork }>(
      `${API}/works/${encodeURIComponent(candidate)}`,
    );
    if (body?.message) {
      return { status: "found", match: toMatch(body.message, citedTitle) };
    }
  }
  return { status: "unregistered" };
}

/**
 * Asks Crossref's bibliographic matcher for works resembling a whole citation
 * string. Passing the entry verbatim works better than a title-only query:
 * the matcher is built for exactly this input and uses the author names,
 * journal and year as additional signal.
 *
 * Returns the candidate whose title best resembles the cited one, or null when
 * the search came back empty. Judging whether that candidate is good enough is
 * deliberately left to the caller.
 */
export async function searchBibliographic(
  entry: ReferenceEntry,
): Promise<ReferenceMatch | null> {
  const query = encodeURIComponent(entry.rawText.slice(0, 500));
  const body = await getJson<{ message?: { items?: CrossrefWork[] } }>(
    `${API}/works?query.bibliographic=${query}&rows=5&select=DOI,title,author,issued,published,URL,container-title`,
  );

  const items = body?.message?.items ?? [];
  if (items.length === 0) return null;

  const compareAgainst = entry.title ?? entry.rawText;
  return items
    .map((work) => toMatch(work, compareAgainst))
    .reduce((best, candidate) =>
      candidate.titleSimilarity > best.titleSimilarity ? candidate : best,
    );
}
