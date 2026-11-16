import { NextRequest, NextResponse } from "next/server";
import { parseDocx, DocxParseError } from "@/lib/docx/parseDocx";
import { extractReferences } from "@/lib/references/extractReferences";
import { verifyReference } from "@/lib/references/verifyReference";
import {
  REFERENCE_SOURCE_SET_VERSION,
  ReferenceEntry,
  ReferenceKind,
} from "@/lib/references/types";
import { readManuscriptFile } from "@/lib/storage/localStorage";
import { requireStaffOrInspectionToken } from "@/lib/auth/guard";
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

interface ResolvedVersion {
  versionId: string;
  fileStoragePath: string;
}

async function resolveManuscriptVersion(
  manuscriptId: string,
): Promise<ResolvedVersion | null> {
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
        versionId: rows[0].currentVersionId,
        fileStoragePath: rows[0].fileStoragePath,
      };
    }
  } catch (err) {
    console.error("Gagal memeriksa versi naskah di database lokal:", err);
  }

  return null;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const authResult = await requireStaffOrInspectionToken(request, id);
  if (authResult.errorResponse) {
    return authResult.errorResponse;
  }

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
    if (localManuscript.length === 0) {
      return NextResponse.json({ error: "Naskah tidak ditemukan." }, { status: 404 });
    }
    return NextResponse.json({ run: null, checks: [] });
  } catch (err) {
    console.error("Gagal membaca status verifikasi referensi lokal:", err);
    return NextResponse.json({ error: "Gagal membaca status verifikasi referensi." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const authResult = await requireStaffOrInspectionToken(request, id);
  if (authResult.errorResponse) {
    return authResult.errorResponse;
  }

  const version = await resolveManuscriptVersion(id);
  if (!version) {
    return NextResponse.json({ error: "Naskah tidak ditemukan." }, { status: 404 });
  }

  let fileBuffer: Buffer | null = null;
  try {
    fileBuffer = await readManuscriptFile(version.fileStoragePath);
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

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const authResult = await requireStaffOrInspectionToken(request, id);
  if (authResult.errorResponse) {
    return authResult.errorResponse;
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

  try {
    const [localRun] = await db
      .select({ id: referenceCheckRuns.id })
      .from(referenceCheckRuns)
      .innerJoin(
        manuscriptVersions,
        eq(manuscriptVersions.id, referenceCheckRuns.manuscriptVersionId),
      )
      .where(
        and(
          eq(referenceCheckRuns.id, runId),
          eq(manuscriptVersions.manuscriptId, id),
        ),
      )
      .limit(1);

    if (!localRun) {
      return NextResponse.json(
        { error: "Proses verifikasi tidak ditemukan untuk naskah ini." },
        { status: 404 },
      );
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: `Gagal memeriksa proses verifikasi: ${err.message}` },
      { status: 500 },
    );
  }

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
