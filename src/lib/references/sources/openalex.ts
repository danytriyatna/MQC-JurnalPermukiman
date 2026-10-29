import { ReferenceEntry, ReferenceMatch } from "@/lib/references/types";
import { titleSimilarity } from "@/lib/references/similarity";
import { getJson } from "@/lib/references/sources/http";

/**
 * OpenAlex — an open index of scholarly works that reaches beyond Crossref's
 * DOI registrations, notably into repository deposits, theses and regional
 * journals. It is consulted only after Crossref has found nothing, so its job
 * is to rescue genuine Indonesian and regional articles from a "not found"
 * that would read as suspicious.
 */

interface OpenAlexWork {
  doi?: string | null;
  title?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  authorships?: { author?: { display_name?: string | null } | null }[] | null;
}

const API = "https://api.openalex.org";

export async function searchByTitle(entry: ReferenceEntry): Promise<ReferenceMatch | null> {
  const needle = entry.title ?? entry.rawText;
  // OpenAlex's `search` filter chokes on the punctuation a raw citation string
  // carries, so commas and quotes are stripped rather than escaped.
  const query = encodeURIComponent(needle.replace(/[,"“”']/g, " ").slice(0, 300).trim());
  if (!query) return null;

  const body = await getJson<{ results?: OpenAlexWork[] }>(
    `${API}/works?search=${query}&per_page=5&select=doi,title,display_name,publication_year,authorships`,
  );

  const results = body?.results ?? [];
  if (results.length === 0) return null;

  return results
    .map<ReferenceMatch>((work) => {
      const title = work.title ?? work.display_name ?? null;
      return {
        source: "openalex",
        title,
        year: work.publication_year ? String(work.publication_year) : null,
        authors: (work.authorships ?? [])
          .map((a) => a?.author?.display_name ?? "")
          .filter((name) => name.length > 0),
        url: work.doi ?? null,
        titleSimilarity: title ? titleSimilarity(needle, title) : 0,
      };
    })
    .reduce((best, candidate) =>
      candidate.titleSimilarity > best.titleSimilarity ? candidate : best,
    );
}
