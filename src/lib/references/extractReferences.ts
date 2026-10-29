import { ParsedDocument } from "@/lib/docx/types";
import { getReferenceEntries, parseReferenceAuthorYear } from "@/lib/docx/rules";
import { ReferenceEntry, ReferenceKind } from "@/lib/references/types";

/**
 * A DOI as registered: "10." then a registrant code, a slash, then a suffix.
 * The suffix has no fixed grammar, so it is taken greedily and trimmed of the
 * sentence punctuation a reference list wraps it in — a trailing full stop is
 * part of the sentence, not of the DOI.
 */
const DOI_PATTERN = /\b(10\.\d{4,9}\/[^\s"<>]+)/i;

const URL_PATTERN = /\bhttps?:\/\/[^\s"<>]+/i;

const ISBN_PATTERN = /\bISBN[:\s]*((?:97[89][\s-]?)?[\d][\d\s-]{8,16}[\dXx])/i;

/**
 * Indonesian legal and standards instruments. These are cited constantly in
 * this journal and are indexed by no bibliographic API, so recognising them is
 * what keeps them out of the "not found" bucket where they would read as
 * suspicious.
 */
const REGULATION_PATTERN =
  /\b(peraturan|undang[-\s]?undang|\buu\b|permen\w*|perpres|perda|perppu|keputusan|kepmen\w*|instruksi|inpres|surat\s+edaran|standar\s+nasional\s+indonesia|\bsni\b|pedoman\s+teknis)\b/i;

const BOOK_PATTERN =
  /\b(penerbit|press|publisher|publishing|publications|erlangga|gramedia|elsevier|springer|routledge|wiley|mcgraw|prentice|\bed\.\)|\bedisi\b|\bjilid\b)\b/i;

/**
 * Volume/issue/page furniture, e.g. "12(3), 45-67" or "Vol. 4 No. 2".
 */
const JOURNAL_PATTERN =
  /(\b\d{1,3}\s*\(\s*\d{1,3}[a-z]?\s*\)\s*[,:]?\s*\d{1,4}\s*[-–]\s*\d{1,4}|\bvol(ume)?\.?\s*\d|\bno\.?\s*\d+\s*,|\bjurnal\b|\bjournal\b|\bprosiding\b|\bproceedings\b|\bpp\.\s*\d)/i;

function cleanTrailingPunctuation(value: string): string {
  return value.replace(/[.,;:)\]]+$/, "");
}

export function extractDoi(rawText: string): string | null {
  const match = rawText.match(DOI_PATTERN);
  if (!match) return null;
  const doi = cleanTrailingPunctuation(match[1]);
  // A bare "10.1234/" with nothing after the slash is not a usable DOI.
  return /\/.+/.test(doi) ? doi : null;
}

/**
 * Every plausible reading of an extracted DOI, most specific first.
 *
 * A DOI suffix has no fixed grammar and may legitimately contain slashes, so
 * when a DOI is printed inside a URL there is no pattern that can tell where
 * the DOI ends and the site's own path continues: the publisher link
 * ".../10.4324/9780203118313/conservation-environmental-management-madagascar"
 * yields a suffix one segment too long. Rather than guess, each truncation at
 * a slash boundary is offered and the registry decides which one it knows.
 *
 * This matters more than its size suggests. An unresolvable DOI is this
 * module's only strong fabrication signal, so an over-long suffix that 404s
 * would accuse a perfectly real book of being invented.
 */
export function doiCandidates(doi: string): string[] {
  const slash = doi.indexOf("/");
  if (slash === -1) return [doi];

  const prefix = doi.slice(0, slash);
  const segments = doi.slice(slash + 1).split("/").filter(Boolean);

  const candidates: string[] = [];
  for (let take = segments.length; take >= 1; take--) {
    candidates.push(`${prefix}/${segments.slice(0, take).join("/")}`);
  }
  // Four attempts is already generous; real suffixes are one or two segments.
  return candidates.slice(0, 4);
}

export function extractUrl(rawText: string): string | null {
  const match = rawText.match(URL_PATTERN);
  if (!match) return null;
  return cleanTrailingPunctuation(match[0]);
}

export function extractIsbn(rawText: string): string | null {
  const match = rawText.match(ISBN_PATTERN);
  if (!match) return null;
  const digits = match[1].replace(/[\s-]/g, "");
  return digits.length === 10 || digits.length === 13 ? digits : null;
}

/**
 * An author-date year written without parentheses, as Chicago/Turabian style
 * does: "Auriga Nusantara. 2025. "Status Deforestasi…"".
 *
 * Anchored to the punctuation that ends the author block and to the
 * punctuation that follows the year, and only looked for near the start of the
 * entry, so a year appearing inside a title ("Sustainable Development Report
 * 2025") cannot be mistaken for the publication year.
 */
const BARE_YEAR_PATTERN = /(?:^|[.,;]\s)((?:19|20)\d{2})[a-z]?(?=\s*[.,])/;

const AUTHOR_BLOCK_SEARCH_LIMIT = 220;

/**
 * Rewrites a bare author-date year into the parenthesised form.
 *
 * This exists so author parsing can stay in one place. `parseReferenceAuthorYear`
 * in the screening rules already handles the hard parts — Indonesian mononyms,
 * institutional and legal "authors", missing initials — but it keys off a
 * parenthesised year because its job is checking APA compliance, where an
 * unparenthesised year is itself the violation. Verification has the opposite
 * obligation: it must read a manuscript's references even when their style is
 * wrong, since whether a cited work exists has nothing to do with how it was
 * punctuated. Normalising here buys that tolerance without loosening the
 * compliance rule or duplicating its name heuristics.
 */
export function normalizeToParenthesisedYear(rawText: string): string {
  if (/\((?:\d{4}[a-z]?(?:,[^)]*)?|n\.d\.)\)/i.test(rawText)) return rawText;

  const head = rawText.slice(0, AUTHOR_BLOCK_SEARCH_LIMIT);
  const match = head.match(BARE_YEAR_PATTERN);
  if (!match || match.index === undefined) return rawText;

  const yearStart = match.index + match[0].length - match[1].length;
  return `${rawText.slice(0, yearStart)}(${match[1]})${rawText.slice(yearStart + match[1].length)}`;
}

export function extractYear(rawText: string): string | null {
  const match = normalizeToParenthesisedYear(rawText).match(/\((\d{4})[a-z]?(?:,[^)]*)?\)/);
  return match ? match[1] : null;
}

/**
 * Pulls the title out of an author-date entry: the sentence following the
 * year, in both APA and Chicago ordering.
 *
 * A quoted title is read to its closing quote, which is by far the most
 * reliable delimiter available and the convention this journal's submissions
 * actually use. Otherwise the first sentence break wins, which is crude — a
 * title containing an abbreviation gets cut short — but a shortened title still
 * scores well under bigram similarity, and journal entries are additionally
 * sent to Crossref's bibliographic matcher as whole citation strings, so this
 * only has to be good enough to compare and to search by.
 */
export function extractTitle(rawText: string): string | null {
  const normalized = normalizeToParenthesisedYear(rawText);
  const yearMatch = normalized.match(/\((?:\d{4}[a-z]?(?:,[^)]*)?|n\.d\.)\)/i);

  const afterYear =
    yearMatch && yearMatch.index !== undefined
      ? normalized.slice(yearMatch.index + yearMatch[0].length)
      : normalized;

  const body = afterYear.replace(/^[\s.,)\]]+/, "");
  if (!body) return null;

  // Only double quotes close a quoted title. An apostrophe must not: titles
  // carry them routinely ("How We're Restoring…", "Rahasia 'Kuil Bawah
  // Tanah'…"), and treating one as the closing mark truncated those titles to
  // a word or two — short enough to be dropped as unparseable.
  const quoted = body.match(/^[“"]\s*(.+?)\s*[”"](?=[\s.,;:]|$)/);
  const candidate = quoted
    ? quoted[1]
    : body.split(
        /\.\s+|\s+https?:\/\/|\s+doi:|\s+available\s+at|\s+accessed\s|\s+diakses\s/i,
      )[0];

  const title = cleanTrailingPunctuation(
    // A bracketed English gloss of an Indonesian title, or a "[Skripsi]"-style
    // genre note, trails the title rather than belonging to it.
    candidate.replace(/\s*\[[^\]]*\]\s*$/, "").trim(),
  ).trim();

  // Some entries carry no title at all, going straight from the year to an
  // access note. Returning "Accessed December 2025" as the title would send
  // that phrase to a bibliographic search engine, and whatever came back
  // would be matched against it — so refuse it and let the entry be judged
  // on its URL instead.
  if (/^(accessed|available|retrieved|diakses|tersedia)\b/i.test(title)) return null;

  // Some entries are nothing but a link. The URL is already captured as the
  // URL; handing it over as a title too would have it compared against real
  // titles, which scores as a mismatch and reads as though the citation were
  // wrong when in truth it simply has no title to check.
  if (/^https?:\/\//i.test(title) || /^www\./i.test(title)) return null;

  return title.length >= 8 ? title : null;
}

export function classifyReference(rawText: string, doi: string | null, isbn: string | null): ReferenceKind {
  // Checked before the DOI branch: a ministry regulation reprinted on a
  // repository can carry a DOI, but searching a bibliographic registry for
  // "Peraturan Menteri PUPR Nomor 14/2017" is still hopeless.
  if (REGULATION_PATTERN.test(rawText)) return "regulation";
  if (isbn || BOOK_PATTERN.test(rawText)) return "book";
  if (doi || JOURNAL_PATTERN.test(rawText)) return "journal";
  if (URL_PATTERN.test(rawText)) return "web";
  return "unknown";
}

/**
 * Turns the bibliography paragraphs of a parsed manuscript into structured
 * entries ready for lookup. Reuses the screening engine's own
 * `getReferenceEntries`, so verification sees exactly the same list the
 * reference-count and citation rules see — one definition of "where the
 * reference list starts and ends", not two that can drift apart.
 *
 * Returns an empty array when the manuscript has no References heading; the
 * missing heading is already reported by the structure rules.
 */
export function extractReferences(doc: ParsedDocument): ReferenceEntry[] {
  const paragraphs = getReferenceEntries(doc);
  if (paragraphs === null) return [];

  return paragraphs.map((paragraph, position) => {
    const rawText = paragraph.text.trim().replace(/\s+/g, " ");
    const doi = extractDoi(rawText);
    const url = extractUrl(rawText);
    const isbn = extractIsbn(rawText);
    const parsed = parseReferenceAuthorYear(normalizeToParenthesisedYear(rawText));

    return {
      entryIndex: position + 1,
      rawText,
      kind: classifyReference(rawText, doi, isbn),
      doi,
      // A doi.org link is the DOI again, not an independent web source.
      url: url && /^https?:\/\/(dx\.)?doi\.org\//i.test(url) ? null : url,
      isbn,
      authorSurnames: parsed?.surnames ?? [],
      year: parsed?.year ?? extractYear(rawText),
      title: extractTitle(rawText),
    };
  });
}
