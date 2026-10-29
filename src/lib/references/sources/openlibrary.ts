import { ReferenceEntry, ReferenceMatch } from "@/lib/references/types";
import { titleSimilarity } from "@/lib/references/similarity";
import { getJson } from "@/lib/references/sources/http";

/**
 * OpenLibrary — book metadata, which neither Crossref nor OpenAlex covers
 * well. An ISBN lookup here plays the same role a DOI lookup plays for
 * articles, except that OpenLibrary's catalogue is contributed rather than
 * authoritative: plenty of real books, especially Indonesian-language ones,
 * are simply absent. So a missing ISBN is reported as "not found", never as
 * fabrication — unlike an unregistered DOI.
 */

interface OpenLibraryEdition {
  title?: string;
  publish_date?: string;
  authors?: { key?: string }[];
}

interface OpenLibraryDoc {
  title?: string;
  first_publish_year?: number;
  author_name?: string[];
  key?: string;
}

const API = "https://openlibrary.org";

function yearFromPublishDate(publishDate: string | undefined): string | null {
  const match = publishDate?.match(/(1[5-9]\d{2}|20\d{2})/);
  return match ? match[1] : null;
}

export async function lookupIsbn(
  isbn: string,
  citedTitle: string | null,
): Promise<ReferenceMatch | null> {
  const edition = await getJson<OpenLibraryEdition>(`${API}/isbn/${encodeURIComponent(isbn)}.json`);
  if (!edition) return null;

  const title = edition.title ?? null;
  return {
    source: "openlibrary",
    title,
    year: yearFromPublishDate(edition.publish_date),
    // The edition record holds author keys, not names; resolving each one costs
    // another request per author for a field the verdict barely uses, so the
    // comparison leans on title and year instead.
    authors: [],
    url: `${API}/isbn/${isbn}`,
    titleSimilarity: citedTitle && title ? titleSimilarity(citedTitle, title) : 0,
  };
}

export async function searchBook(entry: ReferenceEntry): Promise<ReferenceMatch | null> {
  const needle = entry.title;
  if (!needle) return null;

  const body = await getJson<{ docs?: OpenLibraryDoc[] }>(
    `${API}/search.json?title=${encodeURIComponent(needle.slice(0, 250))}&limit=5&fields=title,first_publish_year,author_name,key`,
  );

  const docs = body?.docs ?? [];
  if (docs.length === 0) return null;

  return docs
    .map<ReferenceMatch>((doc) => ({
      source: "openlibrary",
      title: doc.title ?? null,
      year: doc.first_publish_year ? String(doc.first_publish_year) : null,
      authors: doc.author_name ?? [],
      url: doc.key ? `${API}${doc.key}` : null,
      titleSimilarity: doc.title ? titleSimilarity(needle, doc.title) : 0,
    }))
    .reduce((best, candidate) =>
      candidate.titleSimilarity > best.titleSimilarity ? candidate : best,
    );
}
