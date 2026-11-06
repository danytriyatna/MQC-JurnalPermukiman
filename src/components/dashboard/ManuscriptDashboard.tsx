"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Manuscript, ManuscriptStatus } from "@/lib/types";
import { formatDateID, initialsOf } from "@/lib/status";
import DashboardStats from "./DashboardStats";
import AnalyticsCharts from "./AnalyticsCharts";
import FilterSearchBar from "./FilterSearchBar";
import ExportMonthControl from "./ExportMonthControl";
import ManuscriptHistoryTable from "./ManuscriptHistoryTable";
import EmptyStateDashboard from "./EmptyStateDashboard";
import StatusBadge from "./StatusBadge";

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
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[Math.abs(hash)];
}

export default function ManuscriptDashboard({ manuscripts }: { manuscripts: Manuscript[] }) {
  const router = useRouter();
  const [isPendingTransition, startTransition] = useTransition();

  const [activeTab, setActiveTab] = useState<"pending" | "screened" | "all">("pending");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ManuscriptStatus | "all">("all");

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMode, setProcessingMode] = useState<"selected" | "all" | "single" | null>(null);
  const [processingIds, setProcessingIds] = useState<string[]>([]);
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
    setActiveTab(newTab);
    setSelectedIds([]);
    setStatusFilter("all");
    setQuery("");
  };

  // Checkbox handlers for Pending tab
  const isAllSelected =
    displayedManuscripts.length > 0 &&
    displayedManuscripts.every((m) => selectedIds.includes(m.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(displayedManuscripts.map((m) => m.id));
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
        setNotification({
          type: "success",
          message: `Pemeriksaan selesai. Berhasil memproses seluruh ${processed} naskah.`,
        });
      } else if (processed > 0) {
        setNotification({
          type: "warning",
          message: `Pemeriksaan selesai sebagian: ${processed} berhasil, ${ids.length - processed} gagal diproses.`,
        });
      } else {
        setNotification({
          type: "error",
          message: `Gagal memproses naskah yang dipilih (${ids.length} naskah gagal).`,
        });
      }

      // Clear selection of processed items
      setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));

      // Trigger server re-render
      startTransition(() => {
        router.refresh();
      });
    } catch (err: any) {
      setNotification({
        type: "error",
        message: err?.message || "Terjadi kesalahan internal saat menghubungi server penapisan.",
      });
    } finally {
      setIsProcessing(false);
      setProcessingMode(null);
      setProcessingIds([]);
    }
  };

  const resetFilters = () => {
    setQuery("");
    setStatusFilter("all");
  };

  return (
    <div className="flex flex-col gap-5">
      <DashboardStats manuscripts={manuscripts} />

      <AnalyticsCharts manuscripts={manuscripts} />

      {/* Tab Navigation */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex space-x-6" aria-label="Tabs Antrean Tugas">
          <button
            type="button"
            onClick={() => handleTabChange("pending")}
            className={`flex items-center gap-2 whitespace-nowrap border-b-2 py-3 px-1 text-sm font-semibold transition-colors duration-150 ${
              activeTab === "pending"
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            <span>Tugas Pemeriksaan (Pending)</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                activeTab === "pending"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {allPending.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("screened")}
            className={`flex items-center gap-2 whitespace-nowrap border-b-2 py-3 px-1 text-sm font-semibold transition-colors duration-150 ${
              activeTab === "screened"
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            <span>Selesai Diperiksa</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                activeTab === "screened"
                  ? "bg-slate-100 text-slate-800"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {allScreened.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("all")}
            className={`flex items-center gap-2 whitespace-nowrap border-b-2 py-3 px-1 text-sm font-semibold transition-colors duration-150 ${
              activeTab === "all"
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            <span>Semua Naskah</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                activeTab === "all"
                  ? "bg-slate-100 text-slate-800"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {manuscripts.length}
            </span>
          </button>
        </nav>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div
          className={`flex items-center justify-between rounded-xl p-4 text-sm font-medium ${
            notification.type === "success"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
              : notification.type === "warning"
              ? "border border-amber-200 bg-amber-50 text-amber-800"
              : "border border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span>
              {notification.type === "success"
                ? "✅"
                : notification.type === "warning"
                ? "⚠️"
                : "❌"}
            </span>
            <span>{notification.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-xs text-slate-500 hover:text-slate-700 underline"
          >
            Tutup
          </button>
        </div>
      )}

      {/* TAB 1: PENDING QUEUE */}
      {activeTab === "pending" && (
        <div className="flex flex-col gap-4">
          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200/80 bg-blue-50/50 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                <span className="text-base font-bold">📋</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Antrean Tugas Pemeriksaan Redaksi
                </p>
                <p className="text-xs text-slate-500">
                  {selectedIds.length > 0
                    ? `${selectedIds.length} naskah dipilih untuk diproses.`
                    : `${allPending.length} naskah baru menunggu penapisan format standar template.`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={selectedIds.length === 0 || isProcessing || isPendingTransition}
                onClick={() => executeScreening(selectedIds, "selected")}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-blue-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isProcessing && processingMode === "selected" ? (
                  <>
                    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Sedang Memeriksa...</span>
                  </>
                ) : (
                  <>
                    <span>⚡</span>
                    <span>Periksa Naskah Terpilih ({selectedIds.length})</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={allPending.length === 0 || isProcessing || isPendingTransition}
                onClick={() => executeScreening(allPending.map((m) => m.id), "all")}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isProcessing && processingMode === "all" ? (
                  <>
                    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Sedang Memeriksa Semua...</span>
                  </>
                ) : (
                  <>
                    <span>🚀</span>
                    <span>Periksa Semua yang Menunggu</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Search Bar for Pending */}
          <div className="relative w-full sm:max-w-xs">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari naskah yang menunggu..."
              aria-label="Cari naskah pending"
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>

          {allPending.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center shadow-sm">
              <span className="text-4xl">🎉</span>
              <h3 className="mt-3 text-base font-semibold text-slate-900">
                Tidak Ada Antrean Naskah yang Menunggu
              </h3>
              <p className="mt-1 max-w-sm text-sm text-slate-500">
                Seluruh naskah yang masuk telah diperiksa oleh tim redaksi. Naskah baru dari penulis OJS akan otomatis muncul di sini.
              </p>
            </div>
          ) : displayedManuscripts.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
              <p className="text-sm text-slate-600">Tidak ada naskah yang cocok dengan pencarian &quot;{query}&quot;.</p>
              <button
                type="button"
                onClick={() => setQuery("")}
                className="mt-3 text-xs font-semibold text-blue-600 hover:underline"
              >
                Reset Pencarian
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/75">
                      <th scope="col" className="w-12 px-5 py-3.5 text-left">
                        <input
                          type="checkbox"
                          checked={isAllSelected}
                          onChange={toggleSelectAll}
                          aria-label="Pilih Semua Naskah Pending"
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </th>
                      <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Naskah
                      </th>
                      <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Status
                      </th>
                      <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Diunggah oleh
                      </th>
                      <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Waktu Masuk
                      </th>
                      <th scope="col" className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Aksi Redaksi
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedManuscripts.map((manuscript) => {
                      const isSelected = selectedIds.includes(manuscript.id);
                      const isRowProcessing = processingIds.includes(manuscript.id);

                      return (
                        <tr
                          key={manuscript.id}
                          className={`transition-colors duration-150 ${
                            isSelected ? "bg-blue-50/40" : "hover:bg-slate-50"
                          }`}
                        >
                          <td className="w-12 px-5 py-4">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectOne(manuscript.id)}
                              aria-label={`Pilih naskah ${manuscript.title}`}
                              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                          <td className="max-w-xs px-5 py-4">
                            <a
                              href={`/manuscripts/${manuscript.id}`}
                              className="block truncate text-sm font-medium text-slate-900 transition-colors duration-150 hover:text-blue-600 hover:underline"
                              title={manuscript.title}
                            >
                              {manuscript.title}
                            </a>
                            <p className="mt-0.5 truncate text-xs text-slate-500">
                              {manuscript.originalFileName} · v{manuscript.versionNumber}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-5 py-4">
                            <StatusBadge status={manuscript.status} />
                          </td>
                          <td className="whitespace-nowrap px-5 py-4">
                            <div className="flex items-center gap-2">
                              <span
                                className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold ${avatarColorFor(manuscript.uploadedBy)}`}
                              >
                                {initialsOf(manuscript.uploadedBy)}
                              </span>
                              <span className="text-sm text-slate-700">{manuscript.uploadedBy}</span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-500">
                            {formatDateID(manuscript.updatedAt)}
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                disabled={isProcessing || isPendingTransition}
                                onClick={() => executeScreening([manuscript.id], "single")}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-700/20 transition-all hover:bg-blue-100 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {isRowProcessing ? (
                                  <>
                                    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                    </svg>
                                    <span>Memeriksa...</span>
                                  </>
                                ) : (
                                  <>
                                    <span>⚡</span>
                                    <span>Periksa Sekarang</span>
                                  </>
                                )}
                              </button>
                              <a
                                href={`/manuscripts/${manuscript.id}`}
                                className="text-xs font-medium text-slate-500 hover:text-slate-800"
                              >
                                Detail
                              </a>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
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
            onStatusFilterChange={setStatusFilter}
          />

          <ExportMonthControl />

          {displayedManuscripts.length === 0 ? (
            <EmptyStateDashboard variant="no-results" onResetFilters={resetFilters} />
          ) : (
            <ManuscriptHistoryTable manuscripts={displayedManuscripts} />
          )}
        </div>
      )}
    </div>
  );
}
