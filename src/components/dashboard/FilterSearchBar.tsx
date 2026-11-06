"use client";

import { ManuscriptStatus } from "@/lib/types";
import { statusMeta } from "@/lib/status";

const STATUS_FILTERS: { value: ManuscriptStatus | "all"; label: string }[] = [
  { value: "all", label: "Semua" },
  { value: "pending", label: statusMeta.pending.label },
  { value: "needs_revision", label: statusMeta.needs_revision.label },
  { value: "passed", label: statusMeta.passed.label },
  { value: "processing", label: statusMeta.processing.label },
  { value: "processing_failed", label: statusMeta.processing_failed.label },
];

interface FilterSearchBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  statusFilter: ManuscriptStatus | "all";
  onStatusFilterChange: (value: ManuscriptStatus | "all") => void;
}

export default function FilterSearchBar({
  query,
  onQueryChange,
  statusFilter,
  onStatusFilterChange,
}: FilterSearchBarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Cari judul atau nama file..."
          aria-label="Cari naskah"
          className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter status naskah">
        {STATUS_FILTERS.map((filter) => {
          const isActive = statusFilter === filter.value;
          return (
            <button
              key={filter.value}
              type="button"
              onClick={() => onStatusFilterChange(filter.value)}
              aria-pressed={isActive}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-[background-color,color,transform] duration-150 active:scale-95 ${
                isActive
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
              }`}
            >
              {filter.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
