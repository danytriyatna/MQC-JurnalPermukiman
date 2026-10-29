import {
  ReferenceCheckResult,
  ReferenceEntry,
  ReferenceMatch,
  ReferenceVerdict,
  VerdictConfidence,
} from "@/lib/references/types";
import {
  STRONG_TITLE_MATCH,
  WEAK_TITLE_MATCH,
  authorsAgree,
  isComparableTitle,
} from "@/lib/references/similarity";
import { LookupError } from "@/lib/references/sources/http";
import { lookupDoi, searchBibliographic } from "@/lib/references/sources/crossref";
import { searchByTitle } from "@/lib/references/sources/openalex";
import { lookupIsbn, searchBook } from "@/lib/references/sources/openlibrary";
import { checkUrl } from "@/lib/references/sources/urlCheck";
import { analyzeRegulation } from "@/lib/references/sources/regulation";

/**
 * Decides, for one reference entry, what can honestly be said about whether
 * the work it describes exists.
 *
 * The cascade runs strongest evidence first and stops as soon as a question
 * has been answered authoritatively:
 *
 *   1. A printed DOI is resolved against Crossref. This is the only step whose
 *      negative answer is strong — a DOI is issued by a registrar, so one that
 *      resolves nowhere was almost certainly invented. Hallucinated citations
 *      fail here characteristically: a real-looking DOI for a paper that does
 *      not exist.
 *   2. Regulations and standards are checked for internal coherence only,
 *      because nothing indexes them.
 *   3. Books go to OpenLibrary, articles to Crossref's bibliographic matcher
 *      and then OpenAlex.
 *   4. Whatever is still unconfirmed but carries a link has the link checked,
 *      which at least establishes that the cited resource is reachable.
 *
 * Throughout, "we could not find it" is kept strictly separate from "it is not
 * real". Indonesian local journals, ministry publications and grey literature
 * are largely absent from every source consulted here, so for this journal the
 * former is the common case and conflating the two would mean accusing honest
 * authors far more often than catching a fabricated reference.
 */

/**
 * Issue year and online-first year routinely differ by one, and reference
 * lists pick whichever appeared on the copy the author read, so a single
 * year's disagreement is not a discrepancy worth reporting.
 */
function yearsAgree(cited: string | null, found: string | null): boolean {
  if (!cited || !found) return true;
  const a = Number(cited);
  const b = Number(found);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return true;
  return Math.abs(a - b) <= 1;
}

interface Judgement {
  verdict: ReferenceVerdict;
  confidence: VerdictConfidence;
  note: string;
}

/**
 * Grades a candidate record that a search returned, given how much of the
 * cited metadata it agrees with.
 */
/**
 * Secondary literature quotes its subject's title inside its own — "Comments
 * on 'River Basin Disaster Resilience and Sustainability by All'" contains the
 * cited title whole, which drives bigram similarity to 90% for a document that
 * is emphatically not the one cited. The resulting report then reads as though
 * the manuscript had misquoted a year, when in fact the search simply returned
 * a different work.
 */
const SECONDARY_WORK_PREFIX =
  /^\s*["“]?\s*(comments?|reply|response|correction|corrigend(um|a)|errat(um|a)|retraction|withdrawal|discussion|editorial|preface|foreword|book\s+review|review\s+of|introduction\s+to\s+the\s+special)\b/i;

function isSecondaryWorkOf(candidateTitle: string | null, citedTitle: string | null): boolean {
  if (!candidateTitle) return false;
  if (!SECONDARY_WORK_PREFIX.test(candidateTitle)) return false;
  // Only when the cited entry is not itself such a piece.
  return !(citedTitle && SECONDARY_WORK_PREFIX.test(citedTitle));
}

function judgeMatch(entry: ReferenceEntry, match: ReferenceMatch): Judgement | null {
  if (isSecondaryWorkOf(match.title, entry.title)) return null;

  const sameYear = yearsAgree(entry.year, match.year);
  const sameAuthors = authorsAgree(entry.authorSurnames, match.authors);

  if (match.titleSimilarity >= STRONG_TITLE_MATCH) {
    if (sameYear && sameAuthors) {
      return {
        verdict: "verified",
        confidence: "high",
        note: `Ditemukan di ${match.source} dengan judul, tahun, dan penulis yang bersesuaian.`,
      };
    }

    // A book's catalogue year belongs to the edition that was catalogued,
    // while a reference list cites the year of the work — for anything
    // reissued the two legitimately differ by decades. Jacobs' "The Death and
    // Life of Great American Cities" is cited as 1961 and cataloged under the
    // 1992 reissue's ISBN; calling that a discrepancy would be wrong. With the
    // title matching and the authors not contradicting, the book is confirmed.
    if (match.source === "openlibrary" && sameAuthors && !sameYear) {
      return {
        verdict: "verified",
        confidence: "medium",
        note: `Ditemukan di OpenLibrary dengan judul yang bersesuaian. Katalog mencatat tahun ${match.year ?? "tidak diketahui"}, berbeda dari ${entry.year} pada entri — lazim terjadi karena katalog mencatat tahun edisi/cetak ulang, bukan tahun terbit pertama. Pastikan edisi yang dirujuk sudah disebut dengan benar.`,
      };
    }

    const differences = [
      !sameYear ? `tahun tercatat ${match.year ?? "tidak diketahui"}` : null,
      !sameAuthors ? "daftar penulis tidak bersesuaian" : null,
    ].filter(Boolean);

    return {
      verdict: "metadata_mismatch",
      confidence: "high",
      note: `Karya ini ada di ${match.source}, tetapi ${differences.join(" dan ")}. Periksa ketepatan kutipan.`,
    };
  }

  // A partial title match on its own is worthless as evidence. Searching for
  // a government report or a news page returns the nearest scholarly article
  // every time, scoring 55–75% against a completely unrelated work, and
  // reporting those as discrepancies buried the real findings in noise. So the
  // weak band only speaks when the year and an author surname corroborate it,
  // and only for a title long enough to compare meaningfully.
  if (
    match.titleSimilarity >= WEAK_TITLE_MATCH &&
    isComparableTitle(entry.title) &&
    entry.year !== null &&
    match.year !== null &&
    sameYear &&
    entry.authorSurnames.length > 0 &&
    match.authors.length > 0 &&
    sameAuthors
  ) {
    return {
      verdict: "metadata_mismatch",
      confidence: "low",
      note: `Kandidat dengan tahun dan penulis yang bersesuaian ditemukan di ${match.source} ("${match.title ?? "tanpa judul"}"), tetapi kemiripan judul hanya ${Math.round(match.titleSimilarity * 100)}%. Perlu dicek manual apakah ini karya yang dimaksud.`,
    };
  }

  return null;
}

/** Picks whichever candidate resembles the cited title most. */
function bestOf(candidates: (ReferenceMatch | null)[]): ReferenceMatch | null {
  return candidates.reduce<ReferenceMatch | null>((best, candidate) => {
    if (!candidate) return best;
    if (!best) return candidate;
    return candidate.titleSimilarity > best.titleSimilarity ? candidate : best;
  }, null);
}

async function verifyByDoi(
  entry: ReferenceEntry,
  doi: string,
): Promise<{ result: ReferenceCheckResult } | { failed: string }> {
  try {
    const lookup = await lookupDoi(doi, entry.title);

    if (lookup.status === "unregistered") {
      return {
        result: {
          entry,
          verdict: "doi_invalid",
          confidence: "high",
          match: null,
          note: `DOI ${doi} tidak terdaftar di Crossref. DOI diterbitkan oleh registrar, sehingga DOI yang tidak dikenali merupakan indikasi kuat referensi ini tidak nyata — pola khas referensi hasil karangan. Periksa langsung ke penulis.`,
        },
      };
    }

    const match = lookup.match;

    // Without a parseable title there is nothing to compare, but the DOI
    // resolving is itself meaningful: the work exists and the identifier the
    // manuscript printed points at it.
    if (!entry.title) {
      return {
        result: {
          entry,
          verdict: "verified",
          confidence: "medium",
          match,
          note: `DOI terdaftar dan merujuk pada "${match.title ?? "karya tanpa judul"}". Judul pada entri tidak dapat diurai sehingga kesesuaiannya belum dibandingkan.`,
        },
      };
    }

    const judged = judgeMatch(entry, match);
    if (judged) {
      return { result: { entry, match, ...judged } };
    }

    // The DOI resolves, but to something else entirely. Worth a reviewer's
    // attention — usually a copy-paste slip, occasionally a real DOI pasted
    // onto an invented citation.
    return {
      result: {
        entry,
        verdict: "metadata_mismatch",
        confidence: "high",
        match,
        note: `DOI ${doi} terdaftar, tetapi merujuk pada karya lain: "${match.title ?? "tanpa judul"}". DOI kemungkinan tertukar.`,
      },
    };
  } catch (err) {
    return { failed: err instanceof LookupError ? err.message : "gagal menghubungi Crossref" };
  }
}

async function verifyByUrl(
  entry: ReferenceEntry,
  url: string,
  priorNote: string,
): Promise<ReferenceCheckResult> {
  const check = await checkUrl(url);

  const linkMatch: ReferenceMatch = {
    source: "url",
    title: null,
    year: null,
    authors: [],
    url,
    titleSimilarity: 0,
  };

  if (check.status === "alive") {
    return {
      entry,
      verdict: "verified",
      confidence: "low",
      match: linkMatch,
      note: `${priorNote}Tautan yang dicantumkan dapat diakses (${check.httpStatus}). Keberadaan sumbernya terkonfirmasi, tetapi isi halaman tidak dibandingkan dengan kutipan.`,
    };
  }

  if (check.status === "dead") {
    return {
      entry,
      verdict: "url_unreachable",
      confidence: "medium",
      match: linkMatch,
      note: `${priorNote}${check.reason} Tautan mati bisa berarti sumbernya dipindahkan atau dihapus — belum tentu fiktif. Minta penulis memperbarui tautan atau menambahkan tanggal akses.`,
    };
  }

  return {
    entry,
    verdict: "not_verifiable",
    confidence: "low",
    match: linkMatch,
    note: `${priorNote}${check.reason} Perlu diperiksa manual.`,
  };
}

export async function verifyReference(entry: ReferenceEntry): Promise<ReferenceCheckResult> {
  const failures: string[] = [];

  if (entry.doi) {
    const outcome = await verifyByDoi(entry, entry.doi);
    if ("result" in outcome) return outcome.result;
    failures.push(`Crossref (DOI): ${outcome.failed}`);
  }

  if (entry.kind === "regulation") {
    const structure = analyzeRegulation(entry);
    const cited = [
      structure.number ? `nomor ${structure.number}` : null,
      structure.year ? `tahun ${structure.year}` : null,
    ]
      .filter(Boolean)
      .join(", ");

    if (structure.problems.length > 0) {
      return {
        entry,
        verdict: "regulation_inconsistent",
        confidence: "medium",
        match: null,
        note: `Kutipan peraturan ${structure.problems.join("; ")}. Keberadaan peraturannya sendiri tidak dapat diverifikasi otomatis — tidak ada basis data terbuka untuk itu — jadi yang diperiksa hanya kelengkapan dan konsistensi kutipannya.`,
      };
    }

    return {
      entry,
      verdict: "not_verifiable",
      confidence: "medium",
      match: null,
      note: `Peraturan/standar (${cited || "tanpa nomor dan tahun yang terbaca"}). Kutipannya lengkap dan konsisten, tetapi keberadaannya tidak dapat diverifikasi otomatis karena tidak ada basis data peraturan yang terbuka. Perlu dicek manual ke sumber resmi.`,
    };
  }

  // A web source is judged by its link before anything else. Asking a
  // bibliographic registry about a ministry page or a news article returns the
  // nearest scholarly paper, never the page itself, so letting the registry
  // answer first produced a flood of mismatches against works the manuscript
  // never cited. The link is the thing that was actually cited; if it serves,
  // the citation is corroborated and no registry is consulted.
  let webLinkResult: ReferenceCheckResult | null = null;
  if (entry.kind === "web" && entry.url) {
    webLinkResult = await verifyByUrl(entry, entry.url, "");
    if (webLinkResult.verdict === "verified") return webLinkResult;
  }

  const candidates: (ReferenceMatch | null)[] = [];

  if (entry.kind === "book") {
    if (entry.isbn) {
      try {
        candidates.push(await lookupIsbn(entry.isbn, entry.title));
      } catch (err) {
        failures.push(`OpenLibrary (ISBN): ${err instanceof LookupError ? err.message : "gagal"}`);
      }
    }
    try {
      candidates.push(await searchBook(entry));
    } catch (err) {
      failures.push(`OpenLibrary: ${err instanceof LookupError ? err.message : "gagal"}`);
    }
  }

  if (entry.kind === "journal" || entry.kind === "unknown" || entry.kind === "web") {
    try {
      candidates.push(await searchBibliographic(entry));
    } catch (err) {
      failures.push(`Crossref: ${err instanceof LookupError ? err.message : "gagal"}`);
    }
  }

  // OpenAlex is the widest net and the last one cast, so it is skipped once an
  // earlier source has already produced a convincing candidate.
  const soFar = bestOf(candidates);
  if (entry.title && (!soFar || soFar.titleSimilarity < STRONG_TITLE_MATCH)) {
    try {
      candidates.push(await searchByTitle(entry));
    } catch (err) {
      failures.push(`OpenAlex: ${err instanceof LookupError ? err.message : "gagal"}`);
    }
  }

  const best = bestOf(candidates);
  if (best) {
    const judged = judgeMatch(entry, best);
    if (judged) return { entry, match: best, ...judged };
  }

  // The link was already checked above for a web source and did not confirm
  // the citation; that outcome stands rather than being re-fetched.
  if (webLinkResult) return webLinkResult;

  if (entry.url) {
    return verifyByUrl(entry, entry.url, "Tidak ada padanan di Crossref maupun OpenAlex. ");
  }

  // Nothing concluded and every source that was asked errored out — a
  // statement about the network, not about the reference, so it is reported as
  // retryable rather than as a negative finding.
  if (failures.length > 0 && candidates.every((c) => c === null)) {
    return {
      entry,
      verdict: "check_failed",
      confidence: "low",
      match: null,
      note: `Pemeriksaan tidak dapat diselesaikan: ${failures.join("; ")}. Coba jalankan ulang.`,
    };
  }

  if (!entry.title) {
    return {
      entry,
      verdict: "not_verifiable",
      confidence: "low",
      match: null,
      note: "Entri ini tidak memuat judul, DOI, maupun tautan yang dapat diurai, sehingga tidak ada yang bisa dicari. Lengkapi dulu data referensinya.",
    };
  }

  return {
    entry,
    verdict: "not_found",
    confidence: "medium",
    match: null,
    note: "Tidak ditemukan padanan di Crossref, OpenAlex, maupun OpenLibrary. Ini belum berarti fiktif: jurnal lokal Indonesia, terbitan kementerian, dan literatur kelabu umumnya tidak terindeks di sana. Verifikasi manual diperlukan.",
  };
}
