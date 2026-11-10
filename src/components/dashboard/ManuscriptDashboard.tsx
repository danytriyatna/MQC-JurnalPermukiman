"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Manuscript, ManuscriptStatus } from "@/lib/types";
import { formatDateID, initialsOf } from "@/lib/status";
import DashboardStats from "./DashboardStats";
import AnalyticsCharts from "./AnalyticsCharts";
import FilterSearchBar from "./FilterSearchBar";
import ExportMonthControl from "./ExportMonthControl";
import ManuscriptHistoryTable from "./ManuscriptHistoryTable";
import EmptyStateDashboard from "./EmptyStateDashboard";
import PendingQueueTable from "./PendingQueueTable";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BouncedLoader } from "@/components/ui/bounced-loader";
import { Card, CardContent } from "@/components/ui/card";

const AVATAR_PALETTE = [
  "bg-indigo-100 text-indigo-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
];

function avatarColorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) % AVATAR_PALETTE.length;
  }
  return AVATAR_PALETTE[Math.abs(hash)];
}

export default function ManuscriptDashboard({ manuscripts }: { manuscripts: Manuscript[] }) {
  const router = useRouter();
  const [isPendingTransition, startTransition] = useTransition();
  const [isTabPending, startTabTransition] = useTransition();
  const [isSwitchingTab, setIsSwitchingTab] = useState(false);
  const tabTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isFiltering, setIsFiltering] = useState(false);
  const filterTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (tabTimeoutRef.current) clearTimeout(tabTimeoutRef.current);
      if (filterTimeoutRef.current) clearTimeout(filterTimeoutRef.current);
    };
  }, []);

  const [activeTab, setActiveTab] = useState<"pending" | "screened" | "all">("pending");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ManuscriptStatus | "all">("all");

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMode, setProcessingMode] = useState<"selected" | "all" | "single" | null>(null);
  const [processingIds, setProcessingIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [notification, setNotification] = useState<{
    type: "success" | "error" | "warning";
    message: string;
  } | null>(null);

  // Filter groups
  const allPending = useMemo(() => manuscripts.filter((m) => m.status === "pending"), [manuscripts]);
  const allScreened = useMemo(
    () => manuscripts.filter((m) => m.status === "passed" || m.status === "needs_revision"),
    [manuscripts],
  );

  // Tab-specific filtered data with search query applied
  const displayedManuscripts = useMemo(() => {
    let baseList = manuscripts;
    if (activeTab === "pending") {
      baseList = allPending;
    } else if (activeTab === "screened") {
      baseList =
        statusFilter === "all"
          ? allScreened
          : allScreened.filter((m) => m.status === statusFilter);
    } else {
      baseList =
        statusFilter === "all"
          ? manuscripts
          : manuscripts.filter((m) => m.status === statusFilter);
    }

    const q = query.trim().toLowerCase();
    if (!q) return baseList;

    return baseList.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.originalFileName.toLowerCase().includes(q) ||
        m.uploadedBy.toLowerCase().includes(q),
    );
  }, [activeTab, allPending, allScreened, manuscripts, query, statusFilter]);

  const handleTabChange = (newTab: "pending" | "screened" | "all") => {
    if (newTab === activeTab) return;
    const currentScrollY = typeof window !== "undefined" ? window.scrollY : 0;
    if (tabTimeoutRef.current) clearTimeout(tabTimeoutRef.current);
    setIsSwitchingTab(true);
    startTabTransition(() => {
      setActiveTab(newTab);
      setSelectedIds([]);
      setStatusFilter("all");
      setQuery("");
    });
    if (typeof window !== "undefined" && currentScrollY > 0) {
      window.scrollTo({ top: currentScrollY, behavior: "instant" });
      requestAnimationFrame(() => {
        window.scrollTo({ top: currentScrollY, behavior: "instant" });
      });
    }
    tabTimeoutRef.current = setTimeout(() => {
      setIsSwitchingTab(false);
      if (typeof window !== "undefined" && currentScrollY > 0) {
        window.scrollTo({ top: currentScrollY, behavior: "instant" });
      }
    }, 350);
  };

  // Checkbox handlers for Pending tab
  const isAllSelected =
    allPending.length > 0 &&
    allPending.every((m) => selectedIds.includes(m.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(allPending.map((m) => m.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  // Screening execution handler
  const executeScreening = async (ids: string[], mode: "selected" | "all" | "single") => {
    if (ids.length === 0 || isProcessing) return;

    setIsProcessing(true);
    setProcessingMode(mode);
    setProcessingIds(ids);
    setNotification(null);

    try {
      const res = await fetch("/api/manuscripts/screen-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manuscriptIds: ids }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Gagal menjalankan penapisan naskah.");
      }

      const processed = Number(data.processedCount || 0);
      if (processed === ids.length) {
        const msg = `Pemeriksaan selesai. Berhasil memproses ${processed} naskah.`;
        setNotification({ type: "success", message: msg });
        toast.success(msg);
      } else if (processed > 0) {
        const msg = `Pemeriksaan selesai sebagian: ${processed} berhasil, ${ids.length - processed} gagal diproses.`;
        setNotification({ type: "warning", message: msg });
        toast.warning(msg);
      } else {
        const msg = `Gagal memproses naskah yang dipilih (${ids.length} naskah gagal).`;
        setNotification({ type: "error", message: msg });
        toast.error(msg);
      }

      // Clear selection of processed items
      setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));

      // Trigger server re-render
      startTransition(() => {
        router.refresh();
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan internal saat menghubungi server penapisan.";
      setNotification({ type: "error", message: msg });
      toast.error(msg);
    } finally {
      setIsProcessing(false);
      setProcessingMode(null);
      setProcessingIds([]);
    }
  };

  // Soft delete satuan (single)
  const executeDeleteSingle = async (manuscript: Manuscript) => {
    if (isDeleting || isProcessing) return;
    const confirm = window.confirm(
      `Hapus naskah "${manuscript.title}" dari antrean pemeriksaan?\n\nNaskah tidak akan muncul lagi di dasbor antrean (soft delete).`
    );
    if (!confirm) return;

    setIsDeleting(true);
    setDeletingIds([manuscript.id]);

    try {
      const res = await fetch(`/api/manuscripts/${manuscript.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Gagal menghapus naskah.");
      }

      toast.success("Naskah berhasil dihapus dari antrean.");
      setSelectedIds((prev) => prev.filter((id) => id !== manuscript.id));
      startTransition(() => {
        router.refresh();
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat menghapus naskah.";
      toast.error(msg);
    } finally {
      setIsDeleting(false);
      setDeletingIds([]);
    }
  };

  // Soft delete massal (bulk)
  const executeDeleteBatch = async (ids: string[]) => {
    if (ids.length === 0 || isDeleting || isProcessing) return;
    const confirm = window.confirm(
      `Hapus ${ids.length} naskah yang dipilih dari antrean pemeriksaan?\n\nNaskah yang dihapus tidak akan muncul lagi di dasbor antrean (soft delete).`
    );
    if (!confirm) return;

    setIsDeleting(true);
    setDeletingIds(ids);

    try {
      const res = await fetch("/api/manuscripts/delete-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manuscriptIds: ids }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Gagal menghapus naskah terpilih.");
      }

      toast.success(`${data.deletedCount ?? ids.length} naskah berhasil dihapus dari antrean.`);
      setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
      startTransition(() => {
        router.refresh();
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat menghapus naskah massal.";
      toast.error(msg);
    } finally {
      setIsDeleting(false);
      setDeletingIds([]);
    }
  };

  const handleStatusFilterChange = (newStatus: ManuscriptStatus | "all") => {
    if (newStatus === statusFilter) return;
    const currentScrollY = typeof window !== "undefined" ? window.scrollY : 0;
    if (filterTimeoutRef.current) clearTimeout(filterTimeoutRef.current);
    setIsFiltering(true);
    startTabTransition(() => {
      setStatusFilter(newStatus);
    });
    if (typeof window !== "undefined" && currentScrollY > 0) {
      window.scrollTo({ top: currentScrollY, behavior: "instant" });
      requestAnimationFrame(() => {
        window.scrollTo({ top: currentScrollY, behavior: "instant" });
      });
    }
    filterTimeoutRef.current = setTimeout(() => {
      setIsFiltering(false);
      if (typeof window !== "undefined" && currentScrollY > 0) {
        window.scrollTo({ top: currentScrollY, behavior: "instant" });
      }
    }, 300);
  };

  const resetFilters = () => {
    setQuery("");
    setStatusFilter("all");
  };

  return (
    <div className="flex flex-col gap-6">
      <DashboardStats manuscripts={manuscripts} />

      <AnalyticsCharts manuscripts={manuscripts} />

      {/* Tab Navigation */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex space-x-6" aria-label="Tabs Antrean Tugas">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              handleTabChange("pending");
            }}
            className={`flex items-center gap-2 whitespace-nowrap border-b-2 py-3 px-1 text-sm font-semibold transition-colors duration-150 ${
              activeTab === "pending"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:border-slate-300 hover:text-foreground"
            }`}
          >
            <span>Tugas Pemeriksaan (Pending)</span>
            <Badge
              variant={activeTab === "pending" ? "default" : "secondary"}
              className="rounded-full px-2 py-0.5 text-xs font-semibold shadow-none"
            >
              {allPending.length}
            </Badge>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              handleTabChange("screened");
            }}
            className={`flex items-center gap-2 whitespace-nowrap border-b-2 py-3 px-1 text-sm font-semibold transition-colors duration-150 ${
              activeTab === "screened"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:border-slate-300 hover:text-foreground"
            }`}
          >
            <span>Selesai Diperiksa</span>
            <Badge
              variant="secondary"
              className="rounded-full px-2 py-0.5 text-xs font-semibold shadow-none"
            >
              {allScreened.length}
            </Badge>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              handleTabChange("all");
            }}
            className={`flex items-center gap-2 whitespace-nowrap border-b-2 py-3 px-1 text-sm font-semibold transition-colors duration-150 ${
              activeTab === "all"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:border-slate-300 hover:text-foreground"
            }`}
          >
            <span>Semua Naskah</span>
            <Badge
              variant="secondary"
              className="rounded-full px-2 py-0.5 text-xs font-semibold shadow-none"
            >
              {manuscripts.length}
            </Badge>
          </button>
        </nav>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div
          role="alert"
          className={`flex items-center justify-between rounded-xl p-4 text-sm font-medium ${
            notification.type === "success"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
              : notification.type === "warning"
              ? "border border-amber-200 bg-amber-50 text-amber-800"
              : "border border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          <span>{notification.message}</span>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Tab Content with Bounced Loading Feedback */}
      {(isSwitchingTab || isTabPending) ? (
        <BouncedLoader
          variant="container"
          message="Memuat data naskah..."
          label="Memuat naskah..."
        />
      ) : (
        <>
          {/* TAB 1: PENDING QUEUE */}
          {activeTab === "pending" && (
            <div className="flex flex-col gap-4">
              {/* Action Toolbar */}
              <Card className="border-blue-200/80 bg-blue-50/50 shadow-none">
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Antrean Tugas Pemeriksaan Redaksi
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedIds.length > 0
                        ? `${selectedIds.length} naskah dipilih untuk diproses.`
                        : `${allPending.length} naskah baru menunggu penapisan format standar template.`}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Tombol Pemeriksaan Tunggal Adaptif */}
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        (selectedIds.length === 0 ? allPending.length === 0 : false) ||
                        isProcessing ||
                        isDeleting ||
                        isPendingTransition
                      }
                      onClick={() =>
                        selectedIds.length > 0
                          ? executeScreening(selectedIds, "selected")
                          : executeScreening(allPending.map((m) => m.id), "all")
                      }
                      className="rounded-xl shadow-sm"
                    >
                      {isProcessing && (processingMode === "selected" || processingMode === "all") ? (
                        <>
                          <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          <span>
                            {processingMode === "selected"
                              ? `Sedang Memeriksa (${processingIds.length})...`
                              : `Sedang Memeriksa Semua (${allPending.length})...`}
                          </span>
                        </>
                      ) : selectedIds.length > 0 ? (
                        <span>Periksa Terpilih ({selectedIds.length})</span>
                      ) : (
                        <span>Periksa Semua ({allPending.length})</span>
                      )}
                    </Button>

                    {/* Tombol Hapus Massal - Hanya Muncul Saat Ada Centang */}
                    {selectedIds.length > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isProcessing || isDeleting || isPendingTransition}
                        onClick={() => executeDeleteBatch(selectedIds)}
                        className="rounded-xl border-rose-200 bg-white text-rose-600 shadow-sm hover:bg-rose-50 hover:text-rose-700 active:scale-[0.98]"
                      >
                        {isDeleting && deletingIds.length > 1 ? (
                          <>
                            <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                            </svg>
                            <span>Menghapus...</span>
                          </>
                        ) : (
                          <>
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9M19.5 5.5h-15m2 0-.001-1.6a2 2 0 0 1 2-2h3.002a2 2 0 0 1 2 2V5.5m-8 0v13a2 2 0 0 0 2 2h6.002a2 2 0 0 0 2-2v-13" />
                            </svg>
                            <span>Hapus Terpilih ({selectedIds.length})</span>
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {allPending.length === 0 ? (
                <Card className="min-h-[360px] flex flex-col items-center justify-center border-dashed bg-white shadow-sm">
                  <CardContent className="flex flex-col items-center justify-center px-6 py-12 text-center">
                    <h3 className="text-base font-semibold text-slate-900">
                      Tidak Ada Antrean Naskah yang Menunggu
                    </h3>
                    <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                      Seluruh naskah yang masuk telah diperiksa oleh tim redaksi. Naskah baru dari penulis OJS akan otomatis muncul di sini.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <PendingQueueTable
                  manuscripts={allPending}
                  selectedIds={selectedIds}
                  onToggleSelectAll={toggleSelectAll}
                  onToggleSelectOne={toggleSelectOne}
                  isAllSelected={isAllSelected}
                  processingIds={processingIds}
                  deletingIds={deletingIds}
                  onScreenSingle={(id) => executeScreening([id], "single")}
                  onDeleteSingle={executeDeleteSingle}
                />
              )}
            </div>
          )}

          {/* TAB 2 & 3: COMPLETED SCREENING & ALL MANUSCRIPTS */}
          {activeTab !== "pending" && (
            <div className="flex flex-col gap-4">
              <FilterSearchBar
                query={query}
                onQueryChange={setQuery}
                statusFilter={statusFilter}
                onStatusFilterChange={handleStatusFilterChange}
              />

              <ExportMonthControl />

              <div className="relative">
                {isFiltering && (
                  <BouncedLoader
                    variant="overlay"
                    message="Memfilter data naskah..."
                    label="Memfilter naskah..."
                  />
                )}

                {displayedManuscripts.length === 0 ? (
                  <EmptyStateDashboard variant="no-results" onResetFilters={resetFilters} />
                ) : (
                  <ManuscriptHistoryTable manuscripts={displayedManuscripts} />
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
