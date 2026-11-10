"use client";

import { useState } from "react";
import UploadForm from "@/components/upload/UploadForm";
import { Card, CardContent } from "@/components/ui/card";

export default function RevisionUploadSection({ manuscriptId }: { manuscriptId: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Card className="overflow-hidden shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors duration-150 hover:bg-slate-50"
      >
        <span className="text-sm font-semibold text-slate-900">Unggah Revisi Naskah</span>
        <svg
          className={`h-4 w-4 text-slate-400 transition-transform duration-200 ease-[var(--ease-out)] ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {isOpen && (
        <CardContent className="border-t border-slate-100 px-4 py-4">
          <p className="mb-3 text-xs text-slate-500">
            Unggah versi revisi untuk naskah ini. Versi sebelumnya tetap tersimpan, dan hasil pemeriksaan akan diperbarui untuk versi baru.
          </p>
          <UploadForm manuscriptId={manuscriptId} />
        </CardContent>
      )}
    </Card>
  );
}
