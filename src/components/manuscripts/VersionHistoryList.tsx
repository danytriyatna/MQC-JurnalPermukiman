"use client";

import { useState, useEffect } from "react";
import { formatDateID } from "@/lib/status";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Eye,
  Download,
  X,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  FileText,
  FileDown,
  ClipboardCheck,
  Link2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  BookOpenCheck,
} from "lucide-react";

export interface VersionHistoryItem {
  id: string;
  versionNumber: number;
  originalFileName: string;
  uploadedAt: string;
  uploadedBy: string;
  parseStatus: "success" | "partial" | "failed";
}

interface VersionHistoryListProps {
  versions: VersionHistoryItem[];
  manuscriptId?: string;
  currentVersionId?: string | null;
}

interface ReferenceCheckItem {
  id: string;
  entryIndex: number;
  rawText: string;
  kind: "journal" | "book" | "regulation" | "web" | "unknown";
  doi: string | null;
  url: string | null;
  title: string | null;
  citedYear: string | null;
  verdict: string;
  confidence: string | null;
  note: string | null;
  matchSource: string | null;
  matchTitle: string | null;
  matchYear: string | null;
  matchUrl: string | null;
  matchSimilarity: number | null;
}

interface VersionDetailResponse {
  version: VersionHistoryItem & { parseErrorMessage: string | null };
  run: {
    id: string;
    ruleSetVersion: string;
    totalRulesChecked: number;
    totalRulesPassed: number;
    totalRulesFailed: number;
    status: string;
    errorFindings: number;
    warningFindings: number;
    noticeFindings: number;
    runAt: string;
  } | null;
  findings: Array<{
    id: string;
    section: string;
    ruleId: string;
    ruleName: string;
    severity: "error" | "warning" | "notice";
    checkType: string;
    message: string;
    location: string | null;
    currentValue: string | null;
    expectedValue: string | null;
    suggestedFix: string | null;
  }>;
  referenceRun: {
    id: string;
    sourceSetVersion: string;
    totalReferences: number;
    startedAt: string;
    completedAt: string | null;
  } | null;
  referenceChecks: ReferenceCheckItem[];
}

const PARSE_STATUS_LABEL: Record<VersionHistoryItem["parseStatus"], string> = {
  success: "Berhasil dianalisis",
  partial: "Sebagian dianalisis",
  failed: "Gagal dianalisis",
};

const PARSE_STATUS_VARIANT: Record<
  VersionHistoryItem["parseStatus"],
  "success" | "warning" | "destructive"
> = {
  success: "success",
  partial: "warning",
  failed: "destructive",
};

const VERDICT_STYLES: Record<string, { label: string; variant: "success" | "destructive" | "warning" | "secondary" | "outline" }> = {
  verified: { label: "Terkonfirmasi", variant: "success" },
  doi_invalid: { label: "Indikasi Fiktif", variant: "destructive" },
  metadata_mismatch: { label: "Data Melenceng", variant: "warning" },
  regulation_inconsistent: { label: "Kutipan Tidak Konsisten", variant: "warning" },
  url_unreachable: { label: "Tautan Mati", variant: "secondary" },
  not_found: { label: "Tidak Ditemukan", variant: "secondary" },
  not_verifiable: { label: "Di Luar Jangkauan", variant: "secondary" },
  check_failed: { label: "Gagal Diperiksa", variant: "secondary" },
  pending: { label: "Menunggu", variant: "outline" },
};

const KIND_LABELS: Record<string, string> = {
  journal: "Artikel Jurnal",
  book: "Buku",
  regulation: "Peraturan / Standar",
  web: "Sumber Web",
  unknown: "Kutipan Lainnya",
};

export default function VersionHistoryList({
  versions,
  manuscriptId,
  currentVersionId,
}: VersionHistoryListProps) {
  const [selectedVersion, setSelectedVersion] = useState<VersionHistoryItem | null>(null);
  const [activeTab, setActiveTab] = useState<"format" | "references">("format");
  const [isLoading, setIsLoading] = useState(false);
  const [detailData, setDetailData] = useState<VersionDetailResponse | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [expandedRefIds, setExpandedRefIds] = useState<Set<string>>(new Set());

  // Tutup modal dengan tombol Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleCloseModal();
      }
    };
    if (selectedVersion) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedVersion]);

  const handleOpenDetail = async (v: VersionHistoryItem) => {
    setSelectedVersion(v);
    setActiveTab("format");
    setDetailData(null);
    setFetchError(null);
    setExpandedRefIds(new Set());

    if (!manuscriptId) return;

    setIsLoading(true);
    try {
      const res = await fetch(`/api/manuscripts/${manuscriptId}/versions/${v.id}`);
      if (!res.ok) {
        throw new Error("Gagal mengambil data analisis versi.");
      }
      const json = await res.json();
      if (!json.success || !json.data) {
        throw new Error(json.error || "Format respons tidak valid.");
      }
      setDetailData(json.data);
    } catch (err: any) {
      setFetchError(err.message || "Gagal memuat detail versi naskah.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseModal = () => {
    setSelectedVersion(null);
    setDetailData(null);
    setFetchError(null);
    setActiveTab("format");
    setExpandedRefIds(new Set());
  };

  const toggleExpandRef = (id: string) => {
    setExpandedRefIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (versions.length === 0) return null;

  // Metrik verifikasi referensi bila ada
  const totalRefs = detailData?.referenceRun?.totalReferences ?? detailData?.referenceChecks?.length ?? 0;
  const verifiedCount = detailData?.referenceChecks?.filter((c) => c.verdict === "verified").length ?? 0;
  const suspiciousCount = detailData?.referenceChecks?.filter((c) => c.verdict === "doi_invalid").length ?? 0;
  const manualCount = totalRefs - verifiedCount - suspiciousCount;

  return (
    <>
      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
          <CardTitle className="text-sm font-semibold text-slate-900">Riwayat Versi</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-slate-100">
            {versions.map((v) => {
              const isActive = currentVersionId ? v.id === currentVersionId : v.versionNumber === versions[0]?.versionNumber;

              return (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-slate-900">
                        Versi {v.versionNumber} · {v.originalFileName}
                      </p>
                      {isActive && (
                        <Badge
                          variant="outline"
                          className="border-emerald-300 bg-emerald-50 text-emerald-700 text-[11px] font-medium"
                        >
                          Versi Aktif
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Diunggah oleh {v.uploadedBy} · {formatDateID(v.uploadedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={PARSE_STATUS_VARIANT[v.parseStatus]} className="text-xs">
                      {PARSE_STATUS_LABEL[v.parseStatus]}
                    </Badge>
                    {manuscriptId && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenDetail(v)}
                        className="h-8 gap-1.5 text-xs text-slate-700 border-slate-300 hover:bg-slate-50"
                      >
                        <Eye className="h-3.5 w-3.5 text-slate-500" />
                        Detail
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {/* Modal Detail Analisis Versi */}
      {selectedVersion && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={handleCloseModal}
        >
          <div
            className="relative flex flex-col w-full max-w-3xl max-h-[88vh] rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 bg-slate-50/90 px-6 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-indigo-600 shrink-0" />
                  <h2 className="text-base font-semibold text-slate-900 truncate">
                    Hasil Analisis Versi {selectedVersion.versionNumber}
                  </h2>
                  {currentVersionId === selectedVersion.id && (
                    <Badge
                      variant="outline"
                      className="border-emerald-300 bg-emerald-50 text-emerald-700 text-xs"
                    >
                      Versi Aktif
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500 truncate">
                  {selectedVersion.originalFileName} · Diunggah oleh {selectedVersion.uploadedBy} ·{" "}
                  {formatDateID(selectedVersion.uploadedAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                aria-label="Tutup modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Segmented Tab Navigation: Memisahkan Format Template & Referensi secara tegas */}
            <div className="flex border-b border-slate-200 bg-slate-100/60 px-6 pt-2.5 gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("format")}
                className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-semibold transition-all rounded-t-md ${
                  activeTab === "format"
                    ? "border-indigo-600 text-indigo-700 bg-white shadow-2xs"
                    : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                }`}
              >
                <ClipboardCheck className="h-4 w-4" />
                <span>Format Template</span>
                {detailData && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      activeTab === "format"
                        ? "bg-indigo-100 text-indigo-800"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {detailData.findings.length} Temuan
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("references")}
                className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-semibold transition-all rounded-t-md ${
                  activeTab === "references"
                    ? "border-indigo-600 text-indigo-700 bg-white shadow-2xs"
                    : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                }`}
              >
                <Link2 className="h-4 w-4" />
                <span>Verifikasi Referensi</span>
                {detailData && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      activeTab === "references"
                        ? detailData.referenceRun
                          ? "bg-indigo-100 text-indigo-800"
                          : "bg-slate-200 text-slate-600"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {detailData.referenceRun
                      ? `${detailData.referenceRun.totalReferences} Sitasi`
                      : "Belum Ada"}
                  </span>
                )}
              </button>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto p-6 space-y-5 flex-1">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500 space-y-3">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                  <p className="text-sm">Memuat data analisis versi {selectedVersion.versionNumber}…</p>
                </div>
              ) : fetchError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 shrink-0 text-rose-500 mt-0.5" />
                  <div>
                    <p className="font-semibold">Gagal memuat detail analisis</p>
                    <p className="mt-0.5">{fetchError}</p>
                  </div>
                </div>
              ) : detailData ? (
                <>
                  {/* TAB 1: KONTEN FORMAT TEMPLATE */}
                  {activeTab === "format" && (
                    <div className="space-y-4">
                      {/* Kartu Skor Kepatuhan */}
                      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <span className="text-xs font-semibold tracking-wider uppercase text-slate-500">
                              Kepatuhan Format Template
                            </span>
                            <div className="mt-1 flex items-baseline gap-2">
                              <span className="text-2xl font-bold text-slate-900">
                                {detailData.run?.totalRulesPassed ?? 0}/{detailData.run?.totalRulesChecked ?? 0}
                              </span>
                              <span className="text-xs text-slate-500">aturan terpenuhi</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className="border-rose-200 bg-rose-50 text-rose-700 text-xs font-medium px-2.5 py-1"
                            >
                              <AlertCircle className="mr-1 h-3.5 w-3.5 text-rose-500" />
                              {detailData.run?.errorFindings ?? 0} Error
                            </Badge>
                            <Badge
                              variant="outline"
                              className="border-amber-200 bg-amber-50 text-amber-700 text-xs font-medium px-2.5 py-1"
                            >
                              <AlertTriangle className="mr-1 h-3.5 w-3.5 text-amber-500" />
                              {detailData.run?.warningFindings ?? 0} Peringatan
                            </Badge>
                          </div>
                        </div>
                      </div>

                      {/* Daftar Temuan */}
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2.5">
                          Daftar Temuan Format ({detailData.findings.length})
                        </h3>

                        {detailData.findings.length === 0 ? (
                          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-800 flex items-center gap-3">
                            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                            <p>Format naskah pada versi ini telah memenuhi seluruh aturan penapisan redaksi.</p>
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 overflow-hidden">
                            {detailData.findings.map((finding) => (
                              <div key={finding.id} className="p-4 space-y-2 bg-white hover:bg-slate-50/50 transition-colors">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge
                                    variant={finding.severity === "error" ? "destructive" : "warning"}
                                    className="text-[11px] uppercase tracking-wide font-semibold"
                                  >
                                    {finding.severity === "error" ? "Error" : "Peringatan"}
                                  </Badge>
                                  {finding.location && (
                                    <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                                      {finding.location}
                                    </span>
                                  )}
                                </div>

                                <p className="text-sm font-medium text-slate-900">
                                  {finding.message}
                                </p>

                                {(finding.currentValue || finding.expectedValue) && (
                                  <div className="rounded-md bg-slate-50 p-2.5 text-xs text-slate-600 space-y-1">
                                    {finding.currentValue && (
                                      <p>
                                        <span className="font-semibold text-slate-700">Terdeteksi:</span>{" "}
                                        {finding.currentValue}
                                      </p>
                                    )}
                                    {finding.expectedValue && (
                                      <p>
                                        <span className="font-semibold text-slate-700">Standar Template:</span>{" "}
                                        {finding.expectedValue}
                                      </p>
                                    )}
                                  </div>
                                )}

                                {finding.suggestedFix && (
                                  <p className="text-xs text-indigo-700 bg-indigo-50/70 border border-indigo-100 rounded p-2">
                                    <span className="font-semibold">Saran Perbaikan:</span> {finding.suggestedFix}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 2: KONTEN VERIFIKASI REFERENSI */}
                  {activeTab === "references" && (
                    <div className="space-y-4">
                      {detailData.referenceRun && detailData.referenceChecks.length > 0 ? (
                        <>
                          {/* Metrik Mini Verifikasi Referensi */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-center">
                              <span className="text-xs text-slate-500 font-medium">Total Sitasi</span>
                              <p className="text-xl font-bold text-slate-900 mt-0.5">{totalRefs}</p>
                            </div>
                            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-center">
                              <span className="text-xs text-emerald-700 font-medium">Terkonfirmasi</span>
                              <p className="text-xl font-bold text-emerald-800 mt-0.5">{verifiedCount}</p>
                            </div>
                            <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3 text-center">
                              <span className="text-xs text-rose-700 font-medium">Indikasi Fiktif</span>
                              <p className="text-xl font-bold text-rose-800 mt-0.5">{suspiciousCount}</p>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-center">
                              <span className="text-xs text-slate-600 font-medium">Manual / Lainnya</span>
                              <p className="text-xl font-bold text-slate-800 mt-0.5">{manualCount}</p>
                            </div>
                          </div>

                          {/* List Sitasi Referensi */}
                          <div>
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2.5">
                              Daftar Pustaka Versi {selectedVersion.versionNumber} ({detailData.referenceChecks.length})
                            </h3>

                            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 overflow-hidden bg-white">
                              {detailData.referenceChecks.map((refItem) => {
                                const vStyle = VERDICT_STYLES[refItem.verdict] ?? VERDICT_STYLES.pending;
                                const isExpanded = expandedRefIds.has(refItem.id);

                                return (
                                  <div key={refItem.id} className="p-3.5 space-y-1.5 hover:bg-slate-50/50 transition-colors">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-semibold tabular-nums text-slate-400">
                                          #{refItem.entryIndex}
                                        </span>
                                        <Badge variant={vStyle.variant} className="text-[11px] font-semibold">
                                          {vStyle.label}
                                        </Badge>
                                        <span className="text-xs text-slate-500">
                                          {KIND_LABELS[refItem.kind] ?? refItem.kind}
                                        </span>
                                      </div>

                                      {(refItem.matchTitle || refItem.matchUrl || refItem.doi) && (
                                        <button
                                          type="button"
                                          onClick={() => toggleExpandRef(refItem.id)}
                                          className="text-xs font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors"
                                        >
                                          {isExpanded ? (
                                            <>
                                              Sembunyikan Bukti <ChevronUp className="h-3.5 w-3.5" />
                                            </>
                                          ) : (
                                            <>
                                              Lihat Bukti Crossref <ChevronDown className="h-3.5 w-3.5" />
                                            </>
                                          )}
                                        </button>
                                      )}
                                    </div>

                                    <p className="text-xs text-slate-800 leading-relaxed">
                                      {refItem.rawText}
                                    </p>

                                    {refItem.note && (
                                      <p className="text-xs text-slate-500 italic">
                                        {refItem.note}
                                      </p>
                                    )}

                                    {/* Bukti Crossref / OpenAlex yang bisa dibuka-tutup (collapsible) */}
                                    {isExpanded && (
                                      <div className="mt-2 rounded-md bg-slate-50 border border-slate-200 p-2.5 text-xs text-slate-700 space-y-1.5 animate-in fade-in duration-100">
                                        {refItem.doi && (
                                          <p>
                                            <span className="font-semibold text-slate-800">DOI tertera:</span>{" "}
                                            <span className="font-mono">{refItem.doi}</span>
                                          </p>
                                        )}
                                        {refItem.matchSource && (
                                          <p>
                                            <span className="font-semibold text-slate-800">Sumber Basis Data:</span>{" "}
                                            {refItem.matchSource}
                                          </p>
                                        )}
                                        {refItem.matchSimilarity !== null && refItem.matchSimilarity > 0 && (
                                          <p>
                                            <span className="font-semibold text-slate-800">Kemiripan Judul:</span>{" "}
                                            <span className="font-semibold text-emerald-700">
                                              {Math.round(refItem.matchSimilarity * 100)}%
                                            </span>
                                          </p>
                                        )}
                                        {refItem.matchTitle && (
                                          <p>
                                            <span className="font-semibold text-slate-800">Judul di Basis Data:</span>{" "}
                                            {refItem.matchTitle} {refItem.matchYear ? `(${refItem.matchYear})` : ""}
                                          </p>
                                        )}
                                        {refItem.matchUrl && (
                                          <p className="flex items-center gap-1">
                                            <span className="font-semibold text-slate-800">Tautan Resmi:</span>{" "}
                                            <a
                                              href={refItem.matchUrl}
                                              target="_blank"
                                              rel="noreferrer noopener"
                                              className="text-indigo-600 hover:text-indigo-800 underline truncate max-w-sm inline-flex items-center gap-1"
                                            >
                                              {refItem.matchUrl} <ExternalLink className="h-3 w-3 inline" />
                                            </a>
                                          </p>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      ) : (
                        /* Empty State yang bersih dan menenangkan */
                        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-8 text-center space-y-3">
                          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                            <BookOpenCheck className="h-6 w-6" />
                          </div>
                          <div className="max-w-md mx-auto space-y-1">
                            <h4 className="text-sm font-semibold text-slate-800">
                              Belum Ada Riwayat Verifikasi Referensi untuk Versi Ini
                            </h4>
                            <p className="text-xs text-slate-500 leading-relaxed">
                              Pemeriksaan daftar pustaka ke Crossref dan OpenAlex belum pernah dijalankan pada naskah versi ini.
                            </p>
                          </div>
                          {currentVersionId === selectedVersion.id && (
                            <p className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-md py-1.5 px-3 max-w-sm mx-auto font-medium">
                              💡 Karena ini adalah versi aktif, Anda bisa memulai verifikasi melalui tombol &ldquo;Mulai verifikasi&rdquo; di halaman utama.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50 px-6 py-3.5">
              {manuscriptId ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="gap-1.5 border-slate-300 text-slate-700 hover:bg-slate-100"
                  >
                    <a
                      href={`/api/manuscripts/${manuscriptId}/versions/${selectedVersion.id}/download`}
                      download={selectedVersion.originalFileName}
                    >
                      <Download className="h-4 w-4 text-slate-500" />
                      Unduh Naskah Versi Ini
                    </a>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="gap-1.5 border-indigo-200 bg-indigo-50/50 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800"
                  >
                    <a
                      href={`/api/manuscripts/${manuscriptId}/versions/${selectedVersion.id}/report`}
                      download={`Laporan-review-${selectedVersion.originalFileName}`}
                    >
                      <FileDown className="h-4 w-4 text-indigo-600" />
                      Unduh Laporan Versi Ini
                    </a>
                  </Button>
                </div>
              ) : (
                <div />
              )}
              <Button type="button" variant="secondary" size="sm" onClick={handleCloseModal}>
                Tutup
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
