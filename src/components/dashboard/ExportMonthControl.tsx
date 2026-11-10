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
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EFEAE4] pt-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <label htmlFor="export-month" className="text-xs font-semibold text-stone-600">
          Unduh daftar naskah
        </label>
        <input
          id="export-month"
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          disabled={includeAllMonths}
          className="rounded-lg border border-[#DFD9D2] bg-[#FAF8F5] px-2.5 py-1 text-sm text-stone-900 disabled:opacity-50 focus:border-[#C13D0D] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#C13D0D]"
        />
        <label className="flex items-center gap-1.5 text-xs font-medium text-stone-600 cursor-pointer">
          <input
            type="checkbox"
            checked={includeAllMonths}
            onChange={(e) => setIncludeAllMonths(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-[#DFD9D2] accent-[#C13D0D]"
          />
          Semua bulan
        </label>
      </div>
      <a
        href={href}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[#F4D4C9] bg-[#FDF4F0] px-3.5 py-1.5 text-xs font-bold text-[#A0320A] shadow-xs transition-all duration-150 hover:bg-[#C13D0D] hover:border-[#C13D0D] hover:text-white active:scale-[0.97]"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.9} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v13.5m0 0-4.5-4.5M12 16.5l4.5-4.5M4.5 19.5h15" />
        </svg>
        Unduh CSV
      </a>
    </div>
  );
}
