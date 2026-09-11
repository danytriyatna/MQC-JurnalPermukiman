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

const SECTION_LABELS: Record<FindingSection, string> = {
  title_author: "Judul & Penulis",
  abstract: "Abstrak",
  structure_heading: "Struktur & Heading",
  tables_figures_equations: "Tabel, Gambar, Persamaan",
  references_citation: "Referensi & Sitasi",
};

const SECTION_ORDER: FindingSection[] = [
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
    <div className="border-b border-slate-100 px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        {finding.severity === "error" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20">
            Wajib diperbaiki
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
            Disarankan
          </span>
        )}
        {finding.checkType === "manual_review_suggested" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-400/20">
            Perlu verifikasi manual
          </span>
        )}
        <span className="text-xs text-slate-500">{finding.location}</span>
      </div>

      <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-slate-500">Ditemukan</dt>
          <dd className="text-slate-800">
            <ExpandableText text={finding.currentValue} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Seharusnya</dt>
          <dd className="text-slate-800">{finding.expectedValue}</dd>
        </div>
      </dl>

      <p className="mt-2 text-sm text-slate-700">
        <span className="font-medium">Saran perbaikan: </span>
        {finding.suggestedFix}
      </p>
    </div>
  );
}

export default function FindingsView({ findings }: { findings: FindingRowData[] }) {
  if (findings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
          <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        </div>
        <p className="mt-4 text-sm font-medium text-slate-900">Semua pengecekan otomatis terpenuhi</p>
        <p className="mt-1 max-w-sm text-sm text-slate-500">
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
        <div key={group.section} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5">
            <h3 className="text-sm font-semibold text-slate-900">{SECTION_LABELS[group.section]}</h3>
          </div>
          {group.items.map((finding) => (
            <FindingRow key={finding.id} finding={finding} />
          ))}
        </div>
      ))}
    </div>
  );
}
