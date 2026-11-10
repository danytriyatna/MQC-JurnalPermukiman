"use client";

import { useState } from "react";
import { FindingSection } from "@/lib/docx/types";

export interface FindingRowData {
  id: string;
  section: FindingSection;
  severity: "error" | "warning";
  checkType: "automated" | "manual_review_suggested";
  location: string;
  currentValue: string;
  expectedValue: string;
  suggestedFix: string;
}

export const SECTION_LABELS: Record<FindingSection, string> = {
  title_author: "Judul & Penulis",
  abstract: "Abstrak",
  structure_heading: "Struktur & Heading",
  tables_figures_equations: "Tabel, Gambar, Persamaan",
  references_citation: "Referensi & Sitasi",
};

export const SECTION_ORDER: FindingSection[] = [
  "title_author",
  "abstract",
  "structure_heading",
  "tables_figures_equations",
  "references_citation",
];

const EXPANDABLE_THRESHOLD = 120;

function ExpandableText({ text }: { text: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isLong = text.length > EXPANDABLE_THRESHOLD;

  if (!isLong) {
    return <span>{text}</span>;
  }

  return (
    <span>
      {isExpanded ? text : `${text.slice(0, EXPANDABLE_THRESHOLD)}…`}{" "}
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        className="font-medium text-slate-600 underline decoration-slate-300 underline-offset-2 transition-colors duration-150 hover:text-slate-900"
      >
        {isExpanded ? "Sembunyikan" : "Lihat semua"}
      </button>
    </span>
  );
}

function FindingRow({ finding }: { finding: FindingRowData }) {
  return (
    <div className="border-b border-[#EFEAE4] px-5 py-4 transition-colors duration-150 hover:bg-[#FDF9F6] last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        {finding.severity === "error" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/20">
            Wajib diperbaiki
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
            Disarankan
          </span>
        )}
        {finding.checkType === "manual_review_suggested" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-600 ring-1 ring-inset ring-stone-400/25">
            Perlu verifikasi manual
          </span>
        )}
        <span className="text-xs font-medium text-stone-500">{finding.location}</span>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-xl border border-[#EFEAE4] bg-[#FAF8F5]/70 px-3.5 py-2.5">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Ditemukan</dt>
          <dd className="mt-1 text-stone-800">
            <ExpandableText text={finding.currentValue} />
          </dd>
        </div>
        <div className="rounded-xl border border-[#EFEAE4] bg-[#FAF8F5]/70 px-3.5 py-2.5">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Seharusnya</dt>
          <dd className="mt-1 text-stone-800">{finding.expectedValue}</dd>
        </div>
      </dl>

      <p className="mt-2.5 text-sm text-stone-700">
        <span className="font-semibold text-[#A0320A]">Saran perbaikan: </span>
        {finding.suggestedFix}
      </p>
    </div>
  );
}

export default function FindingsView({ findings }: { findings: FindingRowData[] }) {
  if (findings.length === 0) {
    return (
      <div className="fresh-card flex flex-col items-center justify-center rounded-2xl border-t-[3px] border-t-emerald-500 px-6 py-14 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-200">
          <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        </div>
        <p className="mt-4 text-base font-bold text-stone-900">Semua pengecekan otomatis terpenuhi</p>
        <p className="mt-1 max-w-md text-sm text-stone-500">
          Tidak ada temuan ketidaksesuaian format. Beberapa hal (mis. gaya sitasi, usia referensi) tetap disarankan dicek manual.
        </p>
      </div>
    );
  }

  const bySection = SECTION_ORDER.map((section) => ({
    section,
    items: findings.filter((f) => f.section === section),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="flex flex-col gap-4">
      {bySection.map((group) => (
        <div key={group.section} className="fresh-card overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between border-b border-[#EFEAE4] bg-[#FAF8F5]/90 px-5 py-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#C13D0D]" aria-hidden="true" />
              <h3 className="text-sm font-bold text-stone-900">{SECTION_LABELS[group.section]}</h3>
            </div>
            <span className="rounded-full border border-[#F4D4C9] bg-[#FDF4F0] px-2.5 py-0.5 text-xs font-semibold tabular-nums text-[#A0320A]">
              {group.items.length} temuan
            </span>
          </div>
          {group.items.map((finding) => (
            <FindingRow key={finding.id} finding={finding} />
          ))}
        </div>
      ))}
    </div>
  );
}
