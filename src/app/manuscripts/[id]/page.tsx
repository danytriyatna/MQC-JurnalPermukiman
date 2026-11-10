import fs from "fs/promises";
import { notFound } from "next/navigation";
import Link from "next/link";
import AppHeader from "@/components/layout/AppHeader";
import StatusBadge from "@/components/dashboard/StatusBadge";
import FindingsView, { FindingRowData } from "@/components/findings/FindingsView";
import type { FindingSection } from "@/lib/docx/types";
import VersionHistoryList, { VersionHistoryItem } from "@/components/manuscripts/VersionHistoryList";
import RevisionUploadSection from "@/components/manuscripts/RevisionUploadSection";
import DeleteManuscriptButton from "@/components/manuscripts/DeleteManuscriptButton";
import ManuscriptDetailTabs from "@/components/manuscripts/ManuscriptDetailTabs";
import ReferenceVerificationPanel, {
  ReferenceCheckRowData,
  ReferenceRunData,
} from "@/components/references/ReferenceVerificationPanel";
import { screenManuscript } from "@/lib/docx/screenManuscript";
import { findOjsSubmission, readOjsReferenceRun } from "@/lib/ojs/localStore";
import { createClient } from "@/lib/supabase/server";
import { formatDateID } from "@/lib/status";
import { ManuscriptStatus } from "@/lib/types";

function ReportDownloadButtons({
  manuscriptId,
  hasOriginalFile,
}: {
  manuscriptId: string;
  hasOriginalFile: boolean;
}) {
  return (
    <>
      {hasOriginalFile && (
        <a
          href={`/api/manuscripts/${manuscriptId}/original`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#DFD9D2] bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-xs transition-colors hover:bg-[#FAF8F5]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v4.5a1.5 1.5 0 0 1-1.5 1.5h-12a1.5 1.5 0 0 1-1.5-1.5v-4.5M7.5 10.5 12 15m0 0 4.5-4.5M12 15V3" />
          </svg>
          File Asli
        </a>
      )}
      <a
        href={`/api/manuscripts/${manuscriptId}/report`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[#F4D4C9] bg-[#FDF4F0] px-3 py-1.5 text-xs font-bold text-[#A0320A] shadow-xs transition-colors hover:bg-[#C13D0D] hover:text-white"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v13.5m0 0-4.5-4.5M12 16.5l4.5-4.5M4.5 19.5h15" />
        </svg>
        Ekspor Laporan
      </a>
    </>
  );
}

interface PageProps {
  params: Promise<{ id: string }>;
}

interface DetailLayoutProps {
  title: string;
  fileName: string;
  versionNumber: number;
  uploadedBy: string;
  updatedAt: string;
  status: ManuscriptStatus;
  totalRulesChecked: number;
  totalRulesPassed: number;
  errorFindings: number;
  warningFindings: number;
  findings: FindingRowData[];
  versions: VersionHistoryItem[];
  parseErrorMessage?: string | null;
  sourceLabel?: string;
  manuscriptActions?: React.ReactNode;
  referencesCount?: number;
  extraMainContent?: React.ReactNode;
  extraSidebarContent?: React.ReactNode;
}

const TEMPLATE_SECTION_ORDER: FindingSection[] = [
  "title_author",
  "abstract",
  "structure_heading",
  "tables_figures_equations",
  "references_citation",
];

const TEMPLATE_SECTION_LABELS: Record<FindingSection, string> = {
  title_author: "Judul & Penulis",
  abstract: "Abstrak",
  structure_heading: "Struktur & Heading",
  tables_figures_equations: "Tabel, Gambar, Persamaan",
  references_citation: "Referensi & Sitasi",
};

function SectionSummaryCard({ findings }: { findings: FindingRowData[] }) {
  return (
    <div className="fresh-card overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between border-b border-[#EFEAE4] bg-[#FAF8F5]/90 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#C13D0D]" aria-hidden="true" />
          <h3 className="text-sm font-bold text-stone-900">Kelengkapan Bagian Template</h3>
        </div>
        <span className="text-xs font-semibold text-stone-500">5 seksi</span>
      </div>
      <ul className="divide-y divide-[#EFEAE4]">
        {TEMPLATE_SECTION_ORDER.map((section) => {
          const items = findings.filter((f) => f.section === section);
          const errors = items.filter((f) => f.severity === "error").length;
          const warnings = items.filter((f) => f.severity === "warning").length;

          return (
            <li key={section} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-sm font-medium text-stone-800">
                {TEMPLATE_SECTION_LABELS[section]}
              </span>
              {errors === 0 && warnings === 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                  Sesuai
                </span>
              ) : errors > 0 ? (
                <span className="inline-flex items-center rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/20">
                  {errors} wajib{warnings > 0 ? ` · ${warnings} saran` : ""}
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                  {warnings} disarankan
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ManuscriptDetailShell({
  title,
  fileName,
  versionNumber,
  uploadedBy,
  updatedAt,
  status,
  totalRulesChecked,
  totalRulesPassed,
  errorFindings,
  warningFindings,
  findings,
  versions,
  parseErrorMessage,
  sourceLabel,
  manuscriptActions,
  referencesCount = 0,
  extraMainContent,
  extraSidebarContent,
}: DetailLayoutProps) {
  const compliancePercent =
    totalRulesChecked > 0 ? Math.round((totalRulesPassed / totalRulesChecked) * 100) : 0;

  return (
    <div className="flex min-h-screen flex-col puskim-canvas">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1760px] flex-1 px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#DFD9D2] bg-white px-3 py-1.5 text-xs font-semibold text-[#A0320A] shadow-xs transition-colors hover:border-[#F4D4C9] hover:bg-[#FDF4F0]"
          >
            <span aria-hidden="true">&larr;</span>
            Kembali ke Antrean &amp; Riwayat Naskah
          </Link>
          {sourceLabel && (
            <span className="rounded-full border border-[#DFD9D2] bg-white px-3 py-1 text-xs font-semibold text-stone-600 shadow-xs">
              {sourceLabel}
            </span>
          )}
        </div>

        <div className="fresh-card mb-5 rounded-2xl border-t-[3px] border-t-[#C13D0D] p-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-xl font-bold tracking-tight text-stone-900">{title}</h1>
                <StatusBadge status={status} />
              </div>
              <p className="mt-1.5 text-sm text-stone-600">
                Berkas: <span className="font-mono text-xs text-stone-800">{fileName}</span> · Versi{" "}
                {versionNumber} · Penulis:{" "}
                <strong className="font-semibold text-stone-800">{uploadedBy}</strong> · Diperbarui:{" "}
                {formatDateID(updatedAt)}
              </p>
              {manuscriptActions && (
                <div className="mt-3 flex flex-wrap items-center gap-2">{manuscriptActions}</div>
              )}
            </div>

            {status !== "processing_failed" && totalRulesChecked > 0 && (
              <div className="w-full shrink-0 rounded-xl border border-[#F4D4C9] bg-[#FDF4F0]/80 px-4 py-3 lg:w-72">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold text-[#A0320A]">Kepatuhan Template</span>
                  <span className="text-xs font-bold tabular-nums text-[#C13D0D]">
                    {compliancePercent}%
                  </span>
                </div>
                <p className="mt-0.5 text-lg font-bold tabular-nums text-stone-900">
                  {totalRulesPassed}/{totalRulesChecked}{" "}
                  <span className="text-xs font-medium text-stone-600">aturan terpenuhi</span>
                </p>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white ring-1 ring-[#F4D4C9]">
                  <div
                    className={`h-full w-full origin-left rounded-full transition-transform duration-500 ease-[var(--ease-out)] ${
                      errorFindings > 0 ? "bg-amber-500" : "bg-emerald-600"
                    }`}
                    style={{ transform: `scaleX(${totalRulesPassed / totalRulesChecked})` }}
                  />
                </div>
                {(errorFindings > 0 || warningFindings > 0) && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium">
                    {errorFindings > 0 && (
                      <span className="text-rose-700">{errorFindings} wajib diperbaiki</span>
                    )}
                    {warningFindings > 0 && (
                      <span className="text-amber-700">{warningFindings} disarankan</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <ManuscriptDetailTabs
              findingsCount={findings.length}
              referencesCount={referencesCount}
              hasReferencesPanel={Boolean(extraMainContent)}
              findingsContent={
                status === "processing_failed" || parseErrorMessage ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
                    <p className="font-semibold">Gagal memproses naskah</p>
                    <p className="mt-1">
                      {parseErrorMessage ?? "Dokumen tidak dapat dibaca sistem."}
                    </p>
                  </div>
                ) : (
                  <FindingsView findings={findings} />
                )
              }
              referencesContent={extraMainContent}
            />
          </div>

          <div className="space-y-5 lg:col-span-4">
            <SectionSummaryCard findings={findings} />
            <VersionHistoryList versions={versions} />
            {extraSidebarContent}
          </div>
        </div>
      </main>

      <footer className="mt-auto border-t border-[#DFD9D2] bg-white/80 backdrop-blur-xs">
        <div className="mx-auto flex w-full max-w-[1760px] flex-col items-start justify-between gap-2 px-4 py-3 text-xs text-stone-500 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#C13D0D]" aria-hidden="true" />
            <span>
              <strong className="font-semibold text-stone-700">MQC Assistant</strong> · Jurnal
              Permukiman — Direktorat Bina Teknik Permukiman dan Perumahan, Kementerian PU
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

export default async function ManuscriptDetailPage({ params }: PageProps) {
  const { id } = await params;

  if (process.env.NEXT_PUBLIC_DEV_MODE === "true" && id.startsWith("demo-")) {
    const isPassed = id === "demo-mqc-1";
    const demoUpdatedAt = isPassed ? "2026-11-10T07:26:00.000Z" : "2026-11-09T21:26:00.000Z";
    const demoFindings: FindingRowData[] = isPassed
      ? [
          {
            id: "f-1",
            section: "references_citation",
            severity: "warning",
            checkType: "manual_review_suggested",
            location: "Daftar Pustaka [12]",
            currentValue: "Sitasi artikel prosiding tanpa mencantumkan tautan DOI",
            expectedValue: "Disarankan mencantumkan DOI aktif bila tersedia",
            suggestedFix: "Periksa kembali DOI di Crossref atau repositori penerbit",
          },
        ]
      : [
          {
            id: "f-2",
            section: "abstract",
            severity: "error",
            checkType: "automated",
            location: "Abstrak Bahasa Inggris",
            currentValue: "Jumlah kata: 285 kata",
            expectedValue: "Maksimal 200–250 kata sesuai template 2026",
            suggestedFix: "Ringkas bagian latar belakang dan metodologi agar di bawah 250 kata",
          },
          {
            id: "f-3",
            section: "tables_figures_equations",
            severity: "error",
            checkType: "automated",
            location: "Gambar 2 (Peta Sebaran)",
            currentValue: "Judul gambar diletakkan di atas gambar",
            expectedValue:
              "Judul gambar wajib diletakkan di bawah gambar dengan format Gambar 1. Judul",
            suggestedFix: "Pindahkan caption gambar ke bagian bawah objek",
          },
          {
            id: "f-4",
            section: "title_author",
            severity: "warning",
            checkType: "manual_review_suggested",
            location: "Afiliasi Penulis",
            currentValue: "Afiliasi belum mencantumkan kode pos kementerian",
            expectedValue: "Cantumkan nama instansi, kota, dan kode pos",
            suggestedFix: "Tambahkan kode pos instansi pada baris afiliasi",
          },
        ];

    const demoFile = isPassed
      ? "Kajian_Kuat_Lentur_Balok_2026.docx"
      : "Pola_Sebaran_Permukiman_Pesisir.docx";
    const demoRefData = await readOjsReferenceRun(id);

    return (
      <ManuscriptDetailShell
        title={
          isPassed
            ? "Kajian Kuat Lentur Balok Beton Bertulang dengan Agregat Daur Ulang"
            : "Analisis Pola Sebaran dan Kepadatan Permukiman Kumuh Pesisir Semarang"
        }
        fileName={demoFile}
        versionNumber={isPassed ? 1 : 2}
        uploadedBy="Dany Triyatna"
        updatedAt={demoUpdatedAt}
        status={isPassed ? "passed" : "needs_revision"}
        totalRulesChecked={25}
        totalRulesPassed={isPassed ? 24 : 19}
        errorFindings={isPassed ? 0 : 2}
        warningFindings={isPassed ? 1 : 4}
        findings={demoFindings}
        versions={[
          {
            id: "v-1",
            versionNumber: isPassed ? 1 : 2,
            originalFileName: demoFile,
            uploadedAt: demoUpdatedAt,
            parseStatus: "success",
            uploadedBy: "Dany Triyatna",
          },
        ]}
        sourceLabel="Pemeriksaan Format Mandiri"
        manuscriptActions={<ReportDownloadButtons manuscriptId={id} hasOriginalFile={false} />}
        referencesCount={demoRefData.checks.length}
        extraMainContent={
          <ReferenceVerificationPanel
            manuscriptId={id}
            initialRun={demoRefData.run}
            initialChecks={demoRefData.checks}
          />
        }
        extraSidebarContent={<RevisionUploadSection manuscriptId={id} />}
      />
    );
  }

  if (id.startsWith("ojs-")) {
    const ojsItem = await findOjsSubmission(id);

    if (!ojsItem) {
      notFound();
    }

    let ojsFindings: FindingRowData[] = [];
    let parseErrorMessage: string | null = null;
    if (ojsItem.filePath) {
      try {
        const buffer = await fs.readFile(ojsItem.filePath);
        const screening = await screenManuscript(buffer);
        ojsFindings = screening.findings.map((f, idx) => ({
          id: `ojs-f-${idx}`,
          section: f.section,
          severity: f.severity,
          checkType: f.checkType,
          location: f.location ?? "Dokumen Utama",
          currentValue: f.currentValue ?? "-",
          expectedValue: f.expectedValue ?? "-",
          suggestedFix: f.suggestedFix ?? "Sesuaikan dengan template Jurnal Permukiman",
        }));
      } catch (err) {
        parseErrorMessage =
          err instanceof Error ? err.message : "Berkas OJS tidak dapat dianalisis ulang.";
      }
    }

    const ojsRefData = await readOjsReferenceRun(id);

    return (
      <ManuscriptDetailShell
        title={ojsItem.title}
        fileName={ojsItem.originalFileName}
        versionNumber={ojsItem.versionNumber ?? 1}
        uploadedBy={ojsItem.uploadedBy}
        updatedAt={ojsItem.updatedAt}
        status={ojsItem.status}
        totalRulesChecked={ojsItem.totalRulesChecked ?? 25}
        totalRulesPassed={ojsItem.totalRulesPassed ?? 0}
        errorFindings={ojsItem.errorFindings ?? 0}
        warningFindings={ojsItem.warningFindings ?? 0}
        findings={ojsFindings}
        versions={[
          {
            id: "v-1",
            versionNumber: ojsItem.versionNumber ?? 1,
            originalFileName: ojsItem.originalFileName,
            uploadedAt: ojsItem.updatedAt,
            parseStatus: parseErrorMessage ? "failed" : "success",
            uploadedBy: ojsItem.uploadedBy,
          },
        ]}
        parseErrorMessage={parseErrorMessage}
        sourceLabel="Sinkronisasi OJS Jurnal Permukiman"
        manuscriptActions={
          <ReportDownloadButtons manuscriptId={id} hasOriginalFile={Boolean(ojsItem.filePath)} />
        }
        referencesCount={ojsRefData.checks.length}
        extraMainContent={
          ojsItem.filePath ? (
            <ReferenceVerificationPanel
              manuscriptId={id}
              initialRun={ojsRefData.run}
              initialChecks={ojsRefData.checks}
            />
          ) : undefined
        }
        extraSidebarContent={<RevisionUploadSection manuscriptId={id} />}
      />
    );
  }

  const supabase = await createClient();

  const { data: manuscript, error } = await supabase
    .from("manuscripts")
    .select(
      "id, title, original_file_name, status, version_number, total_rules_checked, total_rules_passed, error_findings, warning_findings, created_at, updated_at, current_version_id, deleted_at, uploaded_by_profile:profiles!uploaded_by(full_name)",
    )
    .eq("id", id)
    .single();

  if (error || !manuscript || manuscript.deleted_at) {
    notFound();
  }

  const uploadedByProfile = Array.isArray(manuscript.uploaded_by_profile)
    ? manuscript.uploaded_by_profile[0]
    : manuscript.uploaded_by_profile;

  let parseErrorMessage: string | null = null;
  let findings: FindingRowData[] = [];
  let referenceRun: ReferenceRunData | null = null;
  let referenceChecks: ReferenceCheckRowData[] = [];

  if (manuscript.current_version_id) {
    const { data: version } = await supabase
      .from("manuscript_versions")
      .select("id, parse_status, parse_error_message")
      .eq("id", manuscript.current_version_id)
      .single();

    parseErrorMessage = version?.parse_error_message ?? null;

    if (version) {
      const { data: run } = await supabase
        .from("screening_runs")
        .select("id")
        .eq("manuscript_version_id", version.id)
        .order("run_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (run) {
        const { data: findingRows } = await supabase
          .from("findings")
          .select(
            "id, section, severity, check_type, location, current_value, expected_value, suggested_fix",
          )
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

      const { data: refRun } = await supabase
        .from("reference_check_runs")
        .select("id, source_set_version, total_references, started_at, completed_at")
        .eq("manuscript_version_id", version.id)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (refRun) {
        referenceRun = refRun;
        const { data: refChecks } = await supabase
          .from("reference_checks")
          .select(
            "id, entry_index, raw_text, kind, doi, url, verdict, confidence, note, match_source, match_title, match_year, match_url, match_similarity",
          )
          .eq("run_id", refRun.id)
          .order("entry_index", { ascending: true });

        referenceChecks = (refChecks ?? []) as ReferenceCheckRowData[];
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

  const versions: VersionHistoryItem[] = (versionRows ?? []).map((v) => {
    const profile = Array.isArray(v.uploaded_by_profile)
      ? v.uploaded_by_profile[0]
      : v.uploaded_by_profile;
    return {
      id: v.id,
      versionNumber: v.version_number,
      originalFileName: v.original_file_name,
      uploadedAt: v.uploaded_at,
      uploadedBy: profile?.full_name ?? "—",
      parseStatus: v.parse_status,
    };
  });

  const status = manuscript.status as ManuscriptStatus;

  return (
    <ManuscriptDetailShell
      title={manuscript.title}
      fileName={manuscript.original_file_name}
      versionNumber={manuscript.version_number}
      uploadedBy={uploadedByProfile?.full_name ?? "—"}
      updatedAt={manuscript.updated_at}
      status={status}
      totalRulesChecked={manuscript.total_rules_checked}
      totalRulesPassed={manuscript.total_rules_passed}
      errorFindings={manuscript.error_findings}
      warningFindings={manuscript.warning_findings}
      findings={findings}
      versions={versions}
      parseErrorMessage={parseErrorMessage}
      referencesCount={referenceChecks.length}
      manuscriptActions={
        <>
          {manuscript.current_version_id && (
            <ReportDownloadButtons manuscriptId={manuscript.id} hasOriginalFile />
          )}
          <DeleteManuscriptButton manuscriptId={manuscript.id} />
        </>
      }
      extraMainContent={
        status !== "processing_failed" ? (
          <ReferenceVerificationPanel
            manuscriptId={manuscript.id}
            initialRun={referenceRun}
            initialChecks={referenceChecks}
          />
        ) : undefined
      }
      extraSidebarContent={<RevisionUploadSection manuscriptId={manuscript.id} />}
    />
  );
}
