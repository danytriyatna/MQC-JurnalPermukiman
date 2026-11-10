"use client";

import { useMemo, useState } from "react";
import { Manuscript, ManuscriptStatus } from "@/lib/types";
import DashboardStats from "./DashboardStats";
import AnalyticsCharts from "./AnalyticsCharts";
import FilterSearchBar from "./FilterSearchBar";
import ExportMonthControl from "./ExportMonthControl";
import ManuscriptHistoryTable from "./ManuscriptHistoryTable";
import EmptyStateDashboard from "./EmptyStateDashboard";

export default function ManuscriptDashboard({ manuscripts }: { manuscripts: Manuscript[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ManuscriptStatus | "all">("all");

  const filtered = useMemo(() => {
    return manuscripts
      .filter((m) => (statusFilter === "all" ? true : m.status === statusFilter))
      .filter((m) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return (
          m.title.toLowerCase().includes(q) ||
          m.originalFileName.toLowerCase().includes(q) ||
          m.uploadedBy.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [manuscripts, query, statusFilter]);

  const resetFilters = () => {
    setQuery("");
    setStatusFilter("all");
  };

  if (manuscripts.length === 0) {
    return <EmptyStateDashboard variant="no-manuscripts" />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 xl:items-stretch">
        <div className="xl:col-span-3">
          <DashboardStats manuscripts={manuscripts} />
        </div>
        <div className="xl:col-span-9">
          <AnalyticsCharts manuscripts={manuscripts} />
        </div>
      </div>

      <div className="fresh-card flex flex-col gap-3 rounded-2xl p-3.5 xl:flex-row xl:items-center xl:justify-between xl:gap-4">
        <div className="min-w-0 flex-1">
          <FilterSearchBar
            query={query}
            onQueryChange={setQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
          />
        </div>

        <ExportMonthControl />
      </div>

      {filtered.length === 0 ? (
        <EmptyStateDashboard variant="no-results" onResetFilters={resetFilters} />
      ) : (
        <ManuscriptHistoryTable manuscripts={filtered} />
      )}
    </div>
  );
}
