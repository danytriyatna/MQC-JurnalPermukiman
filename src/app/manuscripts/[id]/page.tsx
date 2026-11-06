import { notFound } from "next/navigation";
import AppHeader from "@/components/layout/AppHeader";
import StatusBadge from "@/components/dashboard/StatusBadge";
import FindingsView, { FindingRowData } from "@/components/findings/FindingsView";
import VersionHistoryList, { VersionHistoryItem } from "@/components/manuscripts/VersionHistoryList";
import RevisionUploadSection from "@/components/manuscripts/RevisionUploadSection";
import DeleteManuscriptButton from "@/components/manuscripts/DeleteManuscriptButton";
import ReferenceVerificationPanel, {
  ReferenceCheckRowData,
  ReferenceRunData,
} from "@/components/references/ReferenceVerificationPanel";
import { createClient } from "@/lib/supabase/server";
import { formatDateID } from "@/lib/status";
import { ManuscriptStatus } from "@/lib/types";
import {
  db,
  manuscripts as manuscriptsTable,
  manuscriptVersions,
  screeningRuns,
  findings as findingsTable,
  referenceCheckRuns,
  referenceChecks as referenceChecksTable,
  users,
} from "@/db";
import { eq, desc } from "drizzle-orm";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}

export default async function ManuscriptDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { token } = await searchParams;

  // 1. Coba ambil data dari basis data lokal PostgreSQL (mqc_db) via Drizzle ORM
  let manuscript: any = null;
  let parseErrorMessage: string | null = null;
  let findings: FindingRowData[] = [];
  let referenceRun: ReferenceRunData | null = null;
  let referenceChecks: ReferenceCheckRowData[] = [];
  let versions: VersionHistoryItem[] = [];
  let uploaderDisplayName = "—";

  try {
    const localManuscriptRows = await db
      .select({
        id: manuscriptsTable.id,
        title: manuscriptsTable.title,
        original_file_name: manuscriptsTable.originalFileName,
        status: manuscriptsTable.status,
        version_number: manuscriptsTable.versionNumber,
        total_rules_checked: manuscriptsTable.totalRulesChecked,
        total_rules_passed: manuscriptsTable.totalRulesPassed,
        error_findings: manuscriptsTable.errorFindings,
        warning_findings: manuscriptsTable.warningFindings,
        created_at: manuscriptsTable.createdAt,
        updated_at: manuscriptsTable.updatedAt,
        current_version_id: manuscriptsTable.currentVersionId,
        deleted_at: manuscriptsTable.deletedAt,
        author_name: manuscriptsTable.authorName,
        uploader_name: users.fullName,
      })
      .from(manuscriptsTable)
      .leftJoin(users, eq(users.id, manuscriptsTable.uploadedBy))
      .where(eq(manuscriptsTable.id, id))
      .limit(1);

    if (localManuscriptRows.length > 0) {
      manuscript = localManuscriptRows[0];
      uploaderDisplayName = manuscript.author_name || manuscript.uploader_name || "Penulis OJS";

      if (manuscript.current_version_id) {
        // Ambil versi aktif
        const versionRows = await db
          .select()
          .from(manuscriptVersions)
          .where(eq(manuscriptVersions.id, manuscript.current_version_id))
          .limit(1);

        if (versionRows.length > 0) {
          const currentVer = versionRows[0];
          parseErrorMessage = currentVer.parseErrorMessage;

          // Ambil screening run terbaru
          const runRows = await db
            .select()
            .from(screeningRuns)
            .where(eq(screeningRuns.manuscriptVersionId, currentVer.id))
            .orderBy(desc(screeningRuns.runAt))
            .limit(1);

          if (runRows.length > 0) {
            const currentRun = runRows[0];
            const localFindingRows = await db
              .select()
              .from(findingsTable)
              .where(eq(findingsTable.screeningRunId, currentRun.id));

            findings = localFindingRows.map((f) => ({
              id: f.id,
              section: f.section as any,
              severity: f.severity as any,
              checkType: f.checkType as any,
              location: f.location,
              currentValue: f.currentValue,
              expectedValue: f.expectedValue,
              suggestedFix: f.suggestedFix,
            }));
          }

          // Ambil reference run bila ada
          const refRunRows = await db
            .select()
            .from(referenceCheckRuns)
            .where(eq(referenceCheckRuns.manuscriptVersionId, currentVer.id))
            .orderBy(desc(referenceCheckRuns.startedAt))
            .limit(1);

          if (refRunRows.length > 0) {
            const refRun = refRunRows[0];
            referenceRun = {
              id: refRun.id,
              source_set_version: refRun.sourceSetVersion,
              total_references: refRun.totalReferences,
              started_at: refRun.startedAt.toISOString(),
              completed_at: refRun.completedAt ? refRun.completedAt.toISOString() : null,
            };

            const refCheckRows = await db
              .select()
              .from(referenceChecksTable)
              .where(eq(referenceChecksTable.runId, refRun.id))
              .orderBy(referenceChecksTable.entryIndex);

            referenceChecks = refCheckRows.map((rc) => ({
              id: rc.id,
              entry_index: rc.entryIndex ?? 0,
              raw_text: rc.rawText,
              kind: rc.kind as any,
              doi: rc.doi,
              url: rc.url,
              verdict: rc.verdict as any,
              confidence: rc.confidence as any,
              note: rc.note,
              match_source: rc.matchSource,
              match_title: rc.matchTitle,
              match_year: rc.matchYear,
              match_url: rc.matchUrl,
              match_similarity: rc.matchSimilarity,
            }));
          }
        }
      }

      // Ambil seluruh riwayat versi
      const allVersions = await db
        .select({
          id: manuscriptVersions.id,
          versionNumber: manuscriptVersions.versionNumber,
          originalFileName: manuscriptVersions.originalFileName,
          uploadedAt: manuscriptVersions.uploadedAt,
          parseStatus: manuscriptVersions.parseStatus,
          authorName: manuscriptsTable.authorName,
          uploaderName: users.fullName,
        })
        .from(manuscriptVersions)
        .innerJoin(manuscriptsTable, eq(manuscriptsTable.id, manuscriptVersions.manuscriptId))
        .leftJoin(users, eq(users.id, manuscriptVersions.uploadedBy))
        .where(eq(manuscriptVersions.manuscriptId, id))
        .orderBy(desc(manuscriptVersions.versionNumber));

      versions = allVersions.map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        originalFileName: v.originalFileName,
        uploadedAt: v.uploadedAt.toISOString(),
        uploadedBy: v.authorName || v.uploaderName || "Penulis OJS",
        parseStatus: v.parseStatus as any,
      }));
    }
  } catch (err) {
    console.error("Gagal membaca detail naskah dari database lokal Drizzle:", err);
  }

  // 2. Fallback ke Supabase jika naskah tidak ada di database lokal
  if (!manuscript) {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("manuscripts")
        .select(
          "id, title, original_file_name, status, version_number, total_rules_checked, total_rules_passed, error_findings, warning_findings, created_at, updated_at, current_version_id, deleted_at, uploaded_by_profile:profiles!uploaded_by(full_name)",
        )
        .eq("id", id)
        .single();

      if (!error && data) {
        manuscript = data;
        const uploadedByProfile = Array.isArray(manuscript.uploaded_by_profile)
          ? manuscript.uploaded_by_profile[0]
          : manuscript.uploaded_by_profile;
        uploaderDisplayName = uploadedByProfile?.full_name ?? "—";

        if (manuscript.current_version_id) {
          const { data: ver } = await supabase
            .from("manuscript_versions")
            .select("id, parse_status, parse_error_message")
            .eq("id", manuscript.current_version_id)
            .single();

          parseErrorMessage = ver?.parse_error_message ?? null;

          if (ver) {
            const { data: run } = await supabase
              .from("screening_runs")
              .select("id")
              .eq("manuscript_version_id", ver.id)
              .order("run_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (run) {
              const { data: findingRows } = await supabase
                .from("findings")
                .select("id, section, severity, check_type, location, current_value, expected_value, suggested_fix")
                .eq("screening_run_id", run.id);

              findings = (findingRows ?? []).map((f) => ({
                id: f.id,
                section: f.section,
                severity: f.severity,
                checkType: f.check_type,
                location: f.location,
                currentValue: f.current_value,
                expectedValue: f.expected_value,
                suggestedFix: f.suggested_fix,
              }));
            }
          }
        }

        const { data: versionRows } = await supabase
          .from("manuscript_versions")
          .select(
            "id, version_number, original_file_name, uploaded_at, parse_status, uploaded_by_profile:profiles!uploaded_by(full_name)",
          )
          .eq("manuscript_id", id)
          .order("version_number", { ascending: false });

        versions = (versionRows ?? []).map((v) => {
          const profile = Array.isArray(v.uploaded_by_profile) ? v.uploaded_by_profile[0] : v.uploaded_by_profile;
          return {
            id: v.id,
            versionNumber: v.version_number,
            originalFileName: v.original_file_name,
            uploadedAt: v.uploaded_at,
            uploadedBy: profile?.full_name ?? "—",
            parseStatus: v.parse_status,
          };
        });
      }
    } catch {
      // Supabase offline
    }
  }

  if (!manuscript || manuscript.deleted_at) {
    notFound();
  }

  const status = manuscript.status as ManuscriptStatus;
  const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : "";

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <a href="/dashboard" className="text-sm text-slate-500 transition-colors duration-150 hover:text-slate-700">
          &larr; Kembali ke Riwayat Naskah
        </a>

        <div className="mt-3 mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">{manuscript.title}</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {manuscript.original_file_name} · versi {manuscript.version_number} · diunggah oleh{" "}
              {uploaderDisplayName} · {formatDateID(manuscript.updated_at instanceof Date ? manuscript.updated_at.toISOString() : manuscript.updated_at)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={status} />
            {manuscript.current_version_id && (
              <>
                <a
                  href={`/api/manuscripts/${manuscript.id}/original${tokenQuery}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-[background-color,transform] duration-150 hover:bg-slate-50 active:scale-[0.97]"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v4.5a1.5 1.5 0 0 1-1.5 1.5h-12a1.5 1.5 0 0 1-1.5-1.5v-4.5M7.5 10.5 12 15m0 0 4.5-4.5M12 15V3" />
                  </svg>
                  File Asli
                </a>
                <a
                  href={`/api/manuscripts/${manuscript.id}/report${tokenQuery}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-[background-color,transform] duration-150 hover:bg-slate-50 active:scale-[0.97]"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v13.5m0 0-4.5-4.5M12 16.5l4.5-4.5M4.5 19.5h15" />
                  </svg>
                  Ekspor Laporan
                </a>
              </>
            )}
            <DeleteManuscriptButton manuscriptId={manuscript.id} />
          </div>
        </div>

        {status === "pending" ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-5 text-sm text-blue-900 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="text-2xl">📋</span>
              <div>
                <h3 className="font-semibold text-blue-950">Menunggu Pemeriksaan Redaksi</h3>
                <p className="mt-1 text-blue-800">
                  Naskah ini telah berhasil diterima dan saat ini berada di dalam antrean tugas pemeriksaan Tim Redaksi Jurnal Permukiman. Hasil penapisan format dan verifikasi referensi akan ditampilkan di sini setelah redaksi menjalankan pemeriksaan.
                </p>
                <div className="mt-3">
                  <a
                    href="/dashboard"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                  >
                    Buka Antrean Pemeriksaan di Dashboard &rarr;
                  </a>
                </div>
              </div>
            </div>
          </div>
        ) : status === "processing_failed" ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <p className="font-medium">Gagal memproses naskah</p>
            <p className="mt-1">{parseErrorMessage ?? "Dokumen tidak dapat dibaca sistem."}</p>
          </div>
        ) : (
          <>
            <div className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold tabular-nums text-slate-900">
                  {manuscript.total_rules_passed}/{manuscript.total_rules_checked}
                </span>
                <span className="text-sm text-slate-500">aturan otomatis terpenuhi</span>
              </div>
              <div className="mt-2 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full w-full origin-left rounded-full transition-transform duration-500 ease-[var(--ease-out)] ${manuscript.error_findings > 0 ? "bg-amber-500" : "bg-emerald-500"}`}
                  style={{
                    transform: `scaleX(${manuscript.total_rules_checked === 0 ? 0 : manuscript.total_rules_passed / manuscript.total_rules_checked})`,
                  }}
                />
              </div>
            </div>

            <FindingsView findings={findings} />

            <div className="mt-4">
              <ReferenceVerificationPanel
                manuscriptId={manuscript.id}
                initialRun={referenceRun}
                initialChecks={referenceChecks}
              />
            </div>
          </>
        )}

        <div className="mt-5 flex flex-col gap-4">
          <RevisionUploadSection manuscriptId={manuscript.id} />
          <VersionHistoryList versions={versions} />
        </div>
      </main>
    </div>
  );
}
