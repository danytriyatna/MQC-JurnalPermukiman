"use client";

import { useState } from "react";

function currentMonthValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function ExportMonthControl() {
  const [month, setMonth] = useState(currentMonthValue());
  const [includeAllMonths, setIncludeAllMonths] = useState(false);

  const href = includeAllMonths
    ? "/api/manuscripts/export"
    : `/api/manuscripts/export?month=${month}`;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
      <label htmlFor="export-month" className="text-xs font-medium text-slate-500">
        Unduh daftar naskah
      </label>
      <input
        id="export-month"
        type="month"
        value={month}
        onChange={(e) => setMonth(e.target.value)}
        disabled={includeAllMonths}
        className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 disabled:opacity-50 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
      />
      <label className="flex items-center gap-1.5 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={includeAllMonths}
          onChange={(e) => setIncludeAllMonths(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-slate-300"
        />
        Semua bulan
      </label>
      <a
        href={href}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-[background-color,transform] duration-150 hover:bg-slate-50 active:scale-[0.97]"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v13.5m0 0-4.5-4.5M12 16.5l4.5-4.5M4.5 19.5h15" />
        </svg>
        Unduh CSV
      </a>
    </div>
  );
}
