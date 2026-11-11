"use client";

import { X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface UnassignedEditorDetails {
  ojsSubmissionId: number;
  title: string;
  authorName: string;
}

interface UnassignedEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  details: UnassignedEditorDetails | null;
}

export default function UnassignedEditorModal({
  isOpen,
  onClose,
  details,
}: UnassignedEditorModalProps) {
  if (!isOpen || !details) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col w-full max-w-lg rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 bg-amber-50/80 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="rounded-full bg-amber-100 p-1.5 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Editor Belum Ditugaskan di OJS
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition-colors"
            aria-label="Tutup modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-700">
            Naskah belum di-assign ke Editor di OJS. Silakan tugaskan Editor di OJS terlebih dahulu.
          </p>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2 text-xs">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold text-slate-500 w-28 shrink-0">No. Pengajuan:</span>
              <span className="font-mono font-bold text-slate-900">#{details.ojsSubmissionId}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-semibold text-slate-500 w-28 shrink-0">Judul Naskah:</span>
              <span className="font-medium text-slate-900 leading-snug">{details.title}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-semibold text-slate-500 w-28 shrink-0">Penulis Utama:</span>
              <span className="text-slate-800">{details.authorName}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-slate-100 bg-slate-50/60 px-6 py-3.5">
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-900 text-white font-medium px-5"
          >
            Tutup
          </Button>
        </div>
      </div>
    </div>
  );
}
