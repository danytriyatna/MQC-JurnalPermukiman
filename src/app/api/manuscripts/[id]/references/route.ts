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
import { readManuscriptFile } from "@/lib/storage/localStorage";
import { verifyInspectionToken } from "@/lib/auth/token";
import {
  db,
  manuscripts as manuscriptsTable,
  manuscriptVersions,
  referenceCheckRuns,
  referenceChecks,
} from "@/db";
import { eq, and, isNull, desc, asc, count } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Reference verification for one manuscript.
 *
 *   GET   — the latest run and its rows, for rendering.
 *   POST  — start a run: read the stored .docx, extract the bibliography, and
 *           record one pending row per entry.
 *   PATCH — look up the next batch of pending rows.
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

async function checkAuth(request: NextRequest, manuscriptId: string): Promise<boolean> {
  const token = request.nextUrl.searchParams.get("token");
  if (token) {
    const verified = await verifyInspectionToken(token, manuscriptId);
    if (verified) return true;
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) return true;
  } catch {
    // Abaikan kegagalan supabase auth
  }

  return false;
}

interface ResolvedVersion {
  isLocal: boolean;
  versionId: string;
  fileStoragePath: string;
}

async function resolveManuscriptVersion(
  manuscriptId: string,
  supabase?: any,
): Promise<ResolvedVersion | null> {
  // 1. Coba cari di PostgreSQL lokal Drizzle
  try {
    const rows = await db
      .select({
        id: manuscriptsTable.id,
        currentVersionId: manuscriptsTable.currentVersionId,
        fileStoragePath: manuscriptVersions.fileStoragePath,
      })
      .from(manuscriptsTable)
      .innerJoin(
        manuscriptVersions,
        eq(manuscriptsTable.currentVersionId, manuscriptVersions.id),
      )
      .where(
        and(
          eq(manuscriptsTable.id, manuscriptId),
          isNull(manuscriptsTable.deletedAt),
        ),
      )
      .limit(1);

    if (rows.length > 0 && rows[0].currentVersionId && rows[0].fileStoragePath) {
      return {
        isLocal: true,
        versionId: rows[0].currentVersionId,
        fileStoragePath: rows[0].fileStoragePath,
      };
    }
  } catch (err) {
    console.error("Gagal memeriksa versi naskah di database lokal:", err);
  }

  // 2. Fallback ke Supabase jika ada
  if (supabase) {
    try {
      const { data: manuscript } = await supabase
        .from("manuscripts")
        .select("current_version_id, deleted_at")
        .eq("id", manuscriptId)
        .single();

      if (manuscript && !manuscript.deleted_at && manuscript.current_version_id) {
        const { data: version } = await supabase
          .from("manuscript_versions")
          .select("id, file_storage_path")
          .eq("id", manuscript.current_version_id)
          .single();

        if (version && version.file_storage_path) {
          return {
            isLocal: false,
            versionId: version.id,
            fileStoragePath: version.file_storage_path,
          };
        }
      }
    } catch {
      // Abaikan error Supabase
    }
  }

  return null;
}

async function getManuscriptBuffer(
  resolved: ResolvedVersion,
  supabase?: any,
): Promise<Buffer | null> {
  if (resolved.isLocal) {
    return await readManuscriptFile(resolved.fileStoragePath);
  }
  if (supabase) {
    const { data: blob } = await supabase.storage
      .from(MANUSCRIPT_BUCKET)
      .download(resolved.fileStoragePath);
    if (blob) {
      return Buffer.from(await blob.arrayBuffer());
    }
  }
  return null;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const isAuthorized = await checkAuth(request, id);

  if (!isAuthorized) {
    return NextResponse.json({ error: "Anda harus login." }, { status: 401 });
  }

  // 1. Coba ambil dari PostgreSQL lokal Drizzle
  try {
    const localManuscript = await db
      .select({
        currentVersionId: manuscriptsTable.currentVersionId,
      })
      .from(manuscriptsTable)
      .where(
        and(
          eq(manuscriptsTable.id, id),
          isNull(manuscriptsTable.deletedAt),
        ),
      )
      .limit(1);

    if (localManuscript.length > 0 && localManuscript[0].currentVersionId) {
      const currentVersionId = localManuscript[0].currentVersionId;
      const [run] = await db
        .select()
        .from(referenceCheckRuns)
        .where(eq(referenceCheckRuns.manuscriptVersionId, currentVersionId))
        .orderBy(desc(referenceCheckRuns.startedAt))
        .limit(1);

      if (!run) {
        return NextResponse.json({ run: null, checks: [] });
      }

      const checks = await db
        .select()
        .from(referenceChecks)
        .where(eq(referenceChecks.runId, run.id))
        .orderBy(asc(referenceChecks.entryIndex));

      return NextResponse.json({
        run: {
          id: run.id,
          source_set_version: run.sourceSetVersion,
          total_references: run.totalReferences,
          started_at: run.startedAt.toISOString(),
          completed_at: run.completedAt?.toISOString() ?? null,
        },
        checks: checks.map((c) => ({
          id: c.id,
          entry_index: c.entryIndex,
          raw_text: c.rawText,
          kind: c.kind,
          doi: c.doi,
          url: c.url,
          title: c.title,
          cited_year: c.citedYear,
          verdict: c.verdict,
          confidence: c.confidence,
          note: c.note,
          match_source: c.matchSource,
          match_title: c.matchTitle,
          match_year: c.matchYear,
          match_url: c.matchUrl,
          match_similarity: c.matchSimilarity,
        })),
      });
    }
  } catch (err) {
    console.error("Gagal membaca status verifikasi referensi lokal:", err);
  }

  // 2. Fallback ke Supabase
  try {
    const supabase = await createClient();
    const version = await resolveManuscriptVersion(id, supabase);
    if (!version) {
      return NextResponse.json({ error: "Naskah tidak ditemukan." }, { status: 404 });
    }

    const { data: run } = await supabase
      .from("reference_check_runs")
      .select("id, source_set_version, total_references, started_at, completed_at")
      .eq("manuscript_version_id", version.versionId)
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
  } catch {
    return NextResponse.json({ error: "Naskah tidak ditemukan." }, { status: 404 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const isAuthorized = await checkAuth(request, id);

  if (!isAuthorized) {
    return NextResponse.json({ error: "Anda harus login." }, { status: 401 });
  }

  let supabase: any = null;
  try {
    supabase = await createClient();
  } catch {}

  const version = await resolveManuscriptVersion(id, supabase);
  if (!version) {
    return NextResponse.json({ error: "Naskah tidak ditemukan." }, { status: 404 });
  }

  let fileBuffer: Buffer | null = null;
  try {
    fileBuffer = await getManuscriptBuffer(version, supabase);
  } catch (err) {
    console.error("Gagal membaca berkas naskah:", err);
  }

  if (!fileBuffer) {
    return NextResponse.json({ error: "Gagal mengambil file naskah." }, { status: 500 });
  }

  let entries: ReferenceEntry[];
  try {
    const doc = await parseDocx(fileBuffer);
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
          "Tidak ada daftar pustaka yang dapat dibaca. Pastikan naskah memiliki bagian References atau DAFTAR PUSTAKA.",
      },
      { status: 400 },
    );
  }

  // A. Jika naskah ada di PostgreSQL lokal (Drizzle)
  if (version.isLocal) {
    try {
      const [run] = await db
        .insert(referenceCheckRuns)
        .values({
          manuscriptVersionId: version.versionId,
          sourceSetVersion: REFERENCE_SOURCE_SET_VERSION,
          totalReferences: entries.length,
        })
        .returning();

      await db.insert(referenceChecks).values(
        entries.map((entry) => ({
          runId: run.id,
          manuscriptVersionId: version.versionId,
          entryIndex: entry.entryIndex,
          rawText: entry.rawText,
          kind: entry.kind,
          doi: entry.doi,
          url: entry.url,
          title: entry.title,
          citedYear: entry.year,
          verdict: "pending",
        })),
      );

      return NextResponse.json(
        {
          run: {
            id: run.id,
            source_set_version: run.sourceSetVersion,
            total_references: run.totalReferences,
            started_at: run.startedAt.toISOString(),
            completed_at: null,
          },
          remaining: entries.length,
        },
        { status: 201 },
      );
    } catch (err: any) {
      console.error("Gagal menyimpan verifikasi referensi ke PostgreSQL:", err);
      return NextResponse.json(
        { error: `Gagal menyimpan daftar referensi: ${err.message}` },
        { status: 500 },
      );
    }
  }

  // B. Fallback ke Supabase Cloud
  try {
    const { data: run, error: runError } = await supabase
      .from("reference_check_runs")
      .insert({
        manuscript_version_id: version.versionId,
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
  } catch (err: any) {
    return NextResponse.json(
      { error: `Gagal memproses verifikasi: ${err.message}` },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const isAuthorized = await checkAuth(request, id);

  if (!isAuthorized) {
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

  // 1. Coba periksa apakah runId ada di database lokal Drizzle
  let isLocalRun = false;
  try {
    const [localRun] = await db
      .select()
      .from(referenceCheckRuns)
      .where(eq(referenceCheckRuns.id, runId))
      .limit(1);
    if (localRun) {
      isLocalRun = true;
    }
  } catch {}

  if (isLocalRun) {
    try {
      const pendingRows = await db
        .select()
        .from(referenceChecks)
        .where(
          and(
            eq(referenceChecks.runId, runId),
            eq(referenceChecks.verdict, "pending"),
          ),
        )
        .orderBy(asc(referenceChecks.entryIndex))
        .limit(BATCH_SIZE);

      const batch = pendingRows.map((r) => ({
        id: r.id,
        entry_index: r.entryIndex ?? 0,
        raw_text: r.rawText,
        kind: r.kind as ReferenceKind,
        doi: r.doi,
        url: r.url,
        title: r.title,
        cited_year: r.citedYear,
        verdict: r.verdict,
        confidence: r.confidence,
        note: r.note,
        match_source: r.matchSource,
        match_title: r.matchTitle,
        match_year: r.matchYear,
        match_url: r.matchUrl,
        match_similarity: r.matchSimilarity,
      }));

      const results = await mapWithConcurrency(batch, CONCURRENCY, async (row) => {
        const result = await verifyReference(entryFromStoredRow(row));

        return {
          id: row.id,
          update: {
            verdict: result.verdict,
            confidence: result.confidence,
            note: result.note,
            matchSource: result.match?.source ?? null,
            matchTitle: result.match?.title ?? null,
            matchYear: result.match?.year ?? null,
            matchUrl: result.match?.url ?? null,
            matchSimilarity: result.match?.titleSimilarity ?? null,
            checkedAt: new Date(),
          },
        };
      });

      for (const { id: rowId, update } of results) {
        await db
          .update(referenceChecks)
          .set(update)
          .where(eq(referenceChecks.id, rowId));
      }

      const [rem] = await db
        .select({ count: count() })
        .from(referenceChecks)
        .where(
          and(
            eq(referenceChecks.runId, runId),
            eq(referenceChecks.verdict, "pending"),
          ),
        );

      const stillPending = Number(rem?.count ?? 0);

      if (stillPending === 0) {
        await db
          .update(referenceCheckRuns)
          .set({ completedAt: new Date() })
          .where(eq(referenceCheckRuns.id, runId));
      }

      const updatedChecks = await db
        .select()
        .from(referenceChecks)
        .where(eq(referenceChecks.runId, runId))
        .orderBy(asc(referenceChecks.entryIndex));

      return NextResponse.json({
        remaining: stillPending,
        checked: batch.length,
        checks: updatedChecks.map((c) => ({
          id: c.id,
          entry_index: c.entryIndex,
          raw_text: c.rawText,
          kind: c.kind,
          doi: c.doi,
          url: c.url,
          title: c.title,
          cited_year: c.citedYear,
          verdict: c.verdict,
          confidence: c.confidence,
          note: c.note,
          match_source: c.matchSource,
          match_title: c.matchTitle,
          match_year: c.matchYear,
          match_url: c.matchUrl,
          match_similarity: c.matchSimilarity,
        })),
      });
    } catch (err: any) {
      console.error("Gagal memperbarui verifikasi referensi lokal:", err);
      return NextResponse.json(
        { error: `Gagal memperbarui verifikasi referensi: ${err.message}` },
        { status: 500 },
      );
    }
  }

  // 2. Fallback ke Supabase jika bukan run lokal
  try {
    const supabase = await createClient();
    const version = await resolveManuscriptVersion(id, supabase);
    if (!version) {
      return NextResponse.json({ error: "Naskah tidak ditemukan." }, { status: 404 });
    }

    const { data: run } = await supabase
      .from("reference_check_runs")
      .select("id, manuscript_version_id")
      .eq("id", runId)
      .eq("manuscript_version_id", version.versionId)
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
  } catch (err: any) {
    return NextResponse.json(
      { error: `Gagal memperbarui verifikasi: ${err.message}` },
      { status: 500 },
    );
  }
}
