import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import AppHeader from "@/components/layout/AppHeader";
import StatusBadge from "@/components/dashboard/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import FindingsView, { FindingRowData } from "@/components/findings/FindingsView";
import VersionHistoryList, { VersionHistoryItem } from "@/components/manuscripts/VersionHistoryList";
import RevisionUploadSection from "@/components/manuscripts/RevisionUploadSection";
import DeleteManuscriptButton from "@/components/manuscripts/DeleteManuscriptButton";
import ScreenNowPendingButton from "@/components/manuscripts/ScreenNowPendingButton";
import DownloadActionButton from "@/components/manuscripts/DownloadActionButton";
import ReferenceVerificationPanel, {
  ReferenceCheckRowData,
  ReferenceRunData,
} from "@/components/references/ReferenceVerificationPanel";
import { getStaffSession } from "@/lib/auth/guard";
import { verifyInspectionToken } from "@/lib/auth/token";
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

  const staffSession = await getStaffSession();
  const isStaff = Boolean(staffSession);
  const validInspectionToken =
    token && token.trim().length > 0
      ? await verifyInspectionToken(token.trim(), id)
      : null;

  if (!isStaff && !validInspectionToken) {
    redirect("/login");
  }

  // 1. Coba ambil data dari basis data lokal PostgreSQL (mqc_db) via Drizzle ORM
  let manuscript: any = null;
  let currentVersionFileName: string | null = null;
  let currentVersionUploadedAt: Date | null = null;
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
          currentVersionFileName = currentVer.originalFileName;
          currentVersionUploadedAt = currentVer.uploadedAt;
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

  if (!manuscript || manuscript.deleted_at) {
    notFound();
  }

  const status = manuscript.status as ManuscriptStatus;
  const tokenQuery = !isStaff && token ? `?token=${encodeURIComponent(token)}` : "";

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      <div>
      <AppHeader />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        {isStaff ? (
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 gap-1.5 text-slate-500 hover:text-slate-900"
          >
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4" />
              Kembali ke Riwayat Naskah
            </Link>
          </Button>
        ) : null}

        <div className="mt-3 mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">{manuscript.title}</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {currentVersionFileName || manuscript.original_file_name} · versi {manuscript.version_number} (Aktif) · diunggah oleh{" "}
              {uploaderDisplayName} · {formatDateID(currentVersionUploadedAt ? currentVersionUploadedAt.toISOString() : (manuscript.updated_at instanceof Date ? manuscript.updated_at.toISOString() : manuscript.updated_at))}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={status} />
            {manuscript.current_version_id && (
              <>
                <DownloadActionButton
                  href={`/api/manuscripts/${manuscript.id}/original${tokenQuery}`}
                  defaultFilename={currentVersionFileName || manuscript.original_file_name || "naskah-asli.docx"}
                  label="File Asli"
                  loadingLabel="Mengunduh…"
                  iconType="original"
                />
                {status !== "pending" && status !== "processing_failed" && (
                  <DownloadActionButton
                    href={`/api/manuscripts/${manuscript.id}/report${tokenQuery}`}
                    defaultFilename={`Laporan - ${manuscript.title || "naskah"}.docx`}
                    label="Ekspor Laporan"
                    loadingLabel="Menyiapkan…"
                    iconType="report"
                  />
                )}
              </>
            )}
            {isStaff ? <DeleteManuscriptButton manuscriptId={manuscript.id} /> : null}
          </div>
        </div>

        {status === "pending" ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-5 text-sm text-blue-900 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="text-2xl">📋</span>
              <div>
                <h3 className="font-semibold text-blue-950">Menunggu Pemeriksaan Redaksi</h3>
                <p className="mt-1 text-blue-800 leading-relaxed">
                  Naskah versi {manuscript.version_number}{" "}
                  {currentVersionFileName ? (
                    <span className="font-medium text-blue-950">({currentVersionFileName})</span>
                  ) : null}{" "}
                  telah berhasil diterima dan saat ini berada di dalam antrean tugas pemeriksaan Tim Redaksi Jurnal Permukiman. Hasil penapisan format dan verifikasi referensi akan ditampilkan di sini setelah redaksi menjalankan pemeriksaan.
                </p>
                {isStaff ? (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <ScreenNowPendingButton
                      manuscriptId={manuscript.id}
                      versionNumber={manuscript.version_number}
                      originalFileName={currentVersionFileName || manuscript.original_file_name}
                    />
                    <Button asChild variant="outline" size="sm" className="border-blue-300 text-blue-700 hover:bg-blue-50">
                      <Link href="/dashboard">
                        Buka Antrean di Dashboard &rarr;
                      </Link>
                    </Button>
                  </div>
                ) : null}
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
            <Card className="mb-4 shadow-sm">
              <CardContent className="p-4">
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
              </CardContent>
            </Card>

            <FindingsView findings={findings} />

            <div className="mt-4">
              <ReferenceVerificationPanel
                manuscriptId={manuscript.id}
                initialRun={referenceRun}
                initialChecks={referenceChecks}
                inspectionToken={!isStaff ? token : undefined}
              />
            </div>
          </>
        )}

        <div className="mt-5 flex flex-col gap-4">
          {isStaff ? <RevisionUploadSection manuscriptId={manuscript.id} /> : null}
          <VersionHistoryList
            versions={versions}
            manuscriptId={manuscript.id}
            currentVersionId={manuscript.current_version_id}
            inspectionToken={!isStaff ? token : undefined}
          />
        </div>
      </main>
      </div>

      <footer className="mt-auto border-t border-[#DFD9D2] bg-white/80 backdrop-blur-xs">
        <div className="mx-auto flex w-full max-w-[1760px] flex-col items-start justify-between gap-2 px-4 py-3 text-xs text-stone-500 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#C13D0D]" aria-hidden="true" />
            <span>
              <strong className="font-semibold text-stone-700">MQC Assistant</strong> · Jurnal Permukiman — Direktorat Bina Teknik Bangunan Gedung dan Penyehatan Lingkungan, Kementerian PU
            </span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="http://localhost/jurnalpermukiman/index.php/JP"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[#A0320A] transition-colors hover:underline"
            >
              Portal OJS Jurnal Permukiman ↗
            </a>
            <Link
              href="/manuscripts/upload"
              className="font-medium text-stone-600 transition-colors hover:text-[#A0320A]"
            >
              Unggah Naskah
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
