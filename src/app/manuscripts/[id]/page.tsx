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

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ManuscriptDetailPage({ params }: PageProps) {
  const { id } = await params;
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

      // Reference verification is stored per version and re-runnable, so the
      // most recent run is shown and the panel can start another.
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

  const status = manuscript.status as ManuscriptStatus;

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
              {uploadedByProfile?.full_name ?? "—"} · {formatDateID(manuscript.updated_at)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={status} />
            {manuscript.current_version_id && (
              <>
                <a
                  href={`/api/manuscripts/${manuscript.id}/original`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-[background-color,transform] duration-150 hover:bg-slate-50 active:scale-[0.97]"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v4.5a1.5 1.5 0 0 1-1.5 1.5h-12a1.5 1.5 0 0 1-1.5-1.5v-4.5M7.5 10.5 12 15m0 0 4.5-4.5M12 15V3" />
                  </svg>
                  File Asli
                </a>
                <a
                  href={`/api/manuscripts/${manuscript.id}/report`}
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

        {status === "processing_failed" ? (
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
