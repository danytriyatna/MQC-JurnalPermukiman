import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseDocx, DocxParseError } from "@/lib/docx/parseDocx";
import { extractReferences } from "@/lib/references/extractReferences";
import { verifyReference } from "@/lib/references/verifyReference";
import {
  REFERENCE_SOURCE_SET_VERSION,
  ReferenceEntry,
  ReferenceKind,
} from "@/lib/references/types";
import { MANUSCRIPT_BUCKET } from "@/lib/upload/constants";

/**
 * Reference verification for one manuscript.
 *
 *   GET   — the latest run and its rows, for rendering.
 *   POST  — start a run: read the stored .docx, extract the bibliography, and
 *           record one pending row per entry.
 *   PATCH — look up the next batch of pending rows.
 *
 * Verification is split across many small PATCH requests rather than done in
 * one call because each entry costs one to four third-party HTTP round trips;
 * a 33-entry bibliography takes about 20 seconds at this concurrency, and
 * bibliographies are not bounded. A single request doing all of it would sit
 * under a serverless function's execution limit with no way to report partial
 * progress, and a timeout would lose the work already paid for. Batching keeps
 * every request short, makes progress visible, and lets an interrupted run be
 * resumed instead of restarted.
 */

/** Entries looked up per PATCH. Sized to stay well inside a function's budget. */
const BATCH_SIZE = 6;

/**
 * Lookups running at once within a batch. Deliberately modest: these are free,
 * unauthenticated public APIs, and hammering them is both rude and a fast way
 * to be rate-limited into `check_failed` verdicts.
 */
const CONCURRENCY = 3;

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface ReferenceCheckRow {
  id: string;
  entry_index: number;
  raw_text: string;
  kind: ReferenceKind;
  doi: string | null;
  url: string | null;
  title: string | null;
  cited_year: string | null;
  verdict: string;
  confidence: string | null;
  note: string | null;
  match_source: string | null;
  match_title: string | null;
  match_year: string | null;
  match_url: string | null;
  match_similarity: number | null;
}

const ROW_COLUMNS =
  "id, entry_index, raw_text, kind, doi, url, title, cited_year, verdict, confidence, note, match_source, match_title, match_year, match_url, match_similarity";

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await fn(items[index]);
      }
    }),
  );

  return results;
}

/**
 * Rebuilds a full entry from the stored text by running it back through the
 * extractor, rather than reading the persisted columns alone.
 *
 * Author surnames and the ISBN are not stored: they exist only to corroborate
 * a candidate match, and re-deriving them is free and keeps the stored schema
 * from having to track every field the matcher happens to want. Re-extracting
 * also means a later improvement to the parser applies to a resumed run.
 */
function entryFromStoredRow(row: ReferenceCheckRow): ReferenceEntry {
  const blankFormat = { bold: false, italic: false, caps: false };
  const reparsed = extractReferences({
    paragraphs: [
      { index: 0, text: "REFERENCES", styleId: null, format: blankFormat },
      { index: 1, text: row.raw_text, styleId: "A6Pustaka", format: blankFormat },
    ],
    section: null,
    declaredPageCount: null,
  })[0];

  if (reparsed) return { ...reparsed, entryIndex: row.entry_index };

  return {
    entryIndex: row.entry_index,
    rawText: row.raw_text,
    kind: row.kind,
    doi: row.doi,
    url: row.url,
    isbn: null,
    authorSurnames: [],
    year: row.cited_year,
    title: row.title,
  };
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function requireVersion(supabase: Supabase, manuscriptId: string) {
  const { data: manuscript } = await supabase
    .from("manuscripts")
    .select("current_version_id, deleted_at")
    .eq("id", manuscriptId)
    .single();

  if (!manuscript || manuscript.deleted_at || !manuscript.current_version_id) {
    return null;
  }

  const { data: version } = await supabase
    .from("manuscript_versions")
    .select("id, file_storage_path")
    .eq("id", manuscript.current_version_id)
    .single();

  return version ?? null;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Anda harus login." }, { status: 401 });
  }

  const version = await requireVersion(supabase, id);
  if (!version) {
    return NextResponse.json({ error: "Naskah tidak ditemukan." }, { status: 404 });
  }

  const { data: run } = await supabase
    .from("reference_check_runs")
    .select("id, source_set_version, total_references, started_at, completed_at")
    .eq("manuscript_version_id", version.id)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!run) {
    return NextResponse.json({ run: null, checks: [] });
  }

  const { data: checks } = await supabase
    .from("reference_checks")
    .select(ROW_COLUMNS)
    .eq("run_id", run.id)
    .order("entry_index", { ascending: true });

  return NextResponse.json({ run, checks: checks ?? [] });
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Anda harus login." }, { status: 401 });
  }

  const version = await requireVersion(supabase, id);
  if (!version) {
    return NextResponse.json({ error: "Naskah tidak ditemukan." }, { status: 404 });
  }

  const { data: blob, error: downloadError } = await supabase.storage
    .from(MANUSCRIPT_BUCKET)
    .download(version.file_storage_path);

  if (downloadError || !blob) {
    return NextResponse.json({ error: "Gagal mengambil file naskah." }, { status: 500 });
  }

  let entries: ReferenceEntry[];
  try {
    const doc = await parseDocx(Buffer.from(await blob.arrayBuffer()));
    entries = extractReferences(doc);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof DocxParseError ? err.message : "Gagal membaca isi dokumen.",
      },
      { status: 400 },
    );
  }

  if (entries.length === 0) {
    return NextResponse.json(
      {
        error:
          "Tidak ada daftar pustaka yang dapat dibaca. Pastikan naskah memiliki bagian References.",
      },
      { status: 400 },
    );
  }

  const { data: run, error: runError } = await supabase
    .from("reference_check_runs")
    .insert({
      manuscript_version_id: version.id,
      source_set_version: REFERENCE_SOURCE_SET_VERSION,
      total_references: entries.length,
    })
    .select("id, source_set_version, total_references, started_at, completed_at")
    .single();

  if (runError || !run) {
    return NextResponse.json(
      { error: `Gagal memulai verifikasi: ${runError?.message}` },
      { status: 500 },
    );
  }

  const { error: insertError } = await supabase.from("reference_checks").insert(
    entries.map((entry) => ({
      run_id: run.id,
      entry_index: entry.entryIndex,
      raw_text: entry.rawText,
      kind: entry.kind,
      doi: entry.doi,
      url: entry.url,
      title: entry.title,
      cited_year: entry.year,
    })),
  );

  if (insertError) {
    return NextResponse.json(
      { error: `Gagal menyimpan daftar referensi: ${insertError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ run, remaining: entries.length }, { status: 201 });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Anda harus login." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }

  const { runId } = (payload ?? {}) as Record<string, unknown>;
  if (typeof runId !== "string") {
    return NextResponse.json({ error: "runId tidak disertakan." }, { status: 400 });
  }

  const version = await requireVersion(supabase, id);
  if (!version) {
    return NextResponse.json({ error: "Naskah tidak ditemukan." }, { status: 404 });
  }

  // The run id comes from the browser, so it is only accepted when it belongs
  // to this manuscript's current version — otherwise one manuscript's page
  // could drive, and overwrite, another's run.
  const { data: run } = await supabase
    .from("reference_check_runs")
    .select("id, manuscript_version_id")
    .eq("id", runId)
    .eq("manuscript_version_id", version.id)
    .maybeSingle();

  if (!run) {
    return NextResponse.json(
      { error: "Proses verifikasi tidak ditemukan untuk naskah ini." },
      { status: 404 },
    );
  }

  const { data: pending } = await supabase
    .from("reference_checks")
    .select(ROW_COLUMNS)
    .eq("run_id", run.id)
    .eq("verdict", "pending")
    .order("entry_index", { ascending: true })
    .limit(BATCH_SIZE);

  const batch = (pending ?? []) as ReferenceCheckRow[];

  const results = await mapWithConcurrency(batch, CONCURRENCY, async (row) => {
    const result = await verifyReference(entryFromStoredRow(row));

    return {
      id: row.id,
      update: {
        verdict: result.verdict,
        confidence: result.confidence,
        note: result.note,
        match_source: result.match?.source ?? null,
        match_title: result.match?.title ?? null,
        match_year: result.match?.year ?? null,
        match_url: result.match?.url ?? null,
        match_similarity: result.match?.titleSimilarity ?? null,
        checked_at: new Date().toISOString(),
      },
    };
  });

  for (const { id: rowId, update } of results) {
    await supabase.from("reference_checks").update(update).eq("id", rowId);
  }

  const { count: remaining } = await supabase
    .from("reference_checks")
    .select("id", { count: "exact", head: true })
    .eq("run_id", run.id)
    .eq("verdict", "pending");

  const stillPending = remaining ?? 0;

  if (stillPending === 0) {
    await supabase
      .from("reference_check_runs")
      .update({ completed_at: new Date().toISOString() })
      .eq("id", run.id);
  }

  const { data: checks } = await supabase
    .from("reference_checks")
    .select(ROW_COLUMNS)
    .eq("run_id", run.id)
    .order("entry_index", { ascending: true });

  return NextResponse.json({
    remaining: stillPending,
    checked: batch.length,
    checks: checks ?? [],
  });
}
