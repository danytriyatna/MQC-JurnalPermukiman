"use client";

import { ManuscriptStatus } from "@/lib/types";
import { statusMeta } from "@/lib/status";

const STATUS_FILTERS: { value: ManuscriptStatus | "all"; label: string }[] = [
  { value: "all", label: "Semua" },
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
          className="w-full rounded-lg border border-[#DFD9D2] bg-[#FAF8F5] py-2 pl-9 pr-3 text-sm text-stone-900 placeholder:text-stone-400 transition-colors focus:border-[#C13D0D] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#C13D0D]"
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
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-150 active:scale-95 ${
                isActive
                  ? "bg-gradient-to-r from-[#D14715] to-[#A0320A] text-white shadow-xs"
                  : "bg-white text-stone-600 ring-1 ring-inset ring-[#DFD9D2] hover:bg-[#FDF4F0] hover:text-[#A0320A] hover:ring-[#F4D4C9]"
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
