"use client";

import { ManuscriptStatus } from "@/lib/types";
import { statusMeta } from "@/lib/status";
import { Button } from "@/components/ui/button";

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
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m21 21-4.35-4.35M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z"
          />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Cari judul atau nama file..."
          aria-label="Cari naskah"
          className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-muted-foreground shadow-none transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div
        className="flex flex-wrap items-center gap-1.5"
        role="group"
        aria-label="Filter status naskah"
      >
        {STATUS_FILTERS.map((filter) => {
          const isActive = statusFilter === filter.value;
          return (
            <Button
              key={filter.value}
              type="button"
              size="sm"
              variant={isActive ? "default" : "outline"}
              onClick={(e) => {
                e.preventDefault();
                onStatusFilterChange(filter.value);
              }}
              aria-pressed={isActive}
              className={`h-8 rounded-full px-3 text-xs font-medium transition-all duration-150 ${
                isActive
                  ? "shadow-sm"
                  : "bg-white text-muted-foreground hover:bg-slate-50 hover:text-foreground"
              }`}
            >
              {filter.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
