"use client";

import { useId, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

const MONTHS = [
  { value: "01", label: "Januari" },
  { value: "02", label: "Februari" },
  { value: "03", label: "Maret" },
  { value: "04", label: "April" },
  { value: "05", label: "Mei" },
  { value: "06", label: "Juni" },
  { value: "07", label: "Juli" },
  { value: "08", label: "Agustus" },
  { value: "09", label: "September" },
  { value: "10", label: "Oktober" },
  { value: "11", label: "November" },
  { value: "12", label: "Desember" },
];

export default function ExportMonthControl() {
  const monthSelectId = useId();
  const yearSelectId = useId();

  const now = useMemo(() => new Date(), []);
  const currentYear = now.getFullYear();
  const currentMonth = String(now.getMonth() + 1).padStart(2, "0");

  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [includeAllMonths, setIncludeAllMonths] = useState(false);

  // Daftar tahun: 2 tahun sebelum s/d 1 tahun ke depan
  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = currentYear - 2; y <= currentYear + 1; y++) {
      list.push(y);
    }
    return list;
  }, [currentYear]);

  const monthParam = `${selectedYear}-${selectedMonth}`;
  const href = includeAllMonths
    ? "/api/manuscripts/export"
    : `/api/manuscripts/export?month=${monthParam}`;

  return (
    <Card className="border-slate-200 bg-white shadow-none">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3 sm:px-4">
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          <span className="text-xs font-semibold text-slate-700">
            Unduh Rekapitulasi:
          </span>

          {/* Komponen Pemilih Bulan */}
          <div className="relative inline-block">
            <select
              id={monthSelectId}
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              disabled={includeAllMonths}
              aria-label="Pilih Bulan Rekapitulasi"
              className="h-8 appearance-none rounded-lg border border-slate-300 bg-white pl-2.5 pr-7 text-xs font-medium text-slate-800 shadow-none transition-colors hover:border-slate-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-50"
            >
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <svg
              className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </div>

          {/* Komponen Pemilih Tahun */}
          <div className="relative inline-block">
            <select
              id={yearSelectId}
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              disabled={includeAllMonths}
              aria-label="Pilih Tahun Rekapitulasi"
              className="h-8 appearance-none rounded-lg border border-slate-300 bg-white pl-2.5 pr-7 text-xs font-medium text-slate-800 shadow-none transition-colors hover:border-slate-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-50"
            >
              {years.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
            <svg
              className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </div>

          {/* Centang Semua Bulan */}
          <div className="flex items-center gap-1.5 ml-1">
            <Checkbox
              id="all-months"
              checked={includeAllMonths}
              onCheckedChange={(checked) => setIncludeAllMonths(Boolean(checked))}
            />
            <label
              htmlFor="all-months"
              className="cursor-pointer text-xs font-medium text-slate-600 select-none hover:text-slate-900"
            >
              Semua bulan
            </label>
          </div>
        </div>

        {/* Tombol Unduh CSV dengan Ikon Download */}
        <Button asChild variant="outline" size="sm" className="rounded-xl font-semibold shadow-none">
          <a href={href} download aria-label="Unduh Rekapitulasi CSV">
            <svg
              className="h-3.5 w-3.5 mr-1.5 text-slate-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
              />
            </svg>
            <span>Unduh CSV</span>
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
