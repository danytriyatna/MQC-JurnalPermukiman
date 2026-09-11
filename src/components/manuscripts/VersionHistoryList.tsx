import { formatDateID } from "@/lib/status";

export interface VersionHistoryItem {
  id: string;
  versionNumber: number;
  originalFileName: string;
  uploadedAt: string;
  uploadedBy: string;
  parseStatus: "success" | "partial" | "failed";
}

const PARSE_STATUS_LABEL: Record<VersionHistoryItem["parseStatus"], string> = {
  success: "Berhasil dianalisis",
  partial: "Sebagian dianalisis",
  failed: "Gagal dianalisis",
};

const PARSE_STATUS_COLOR: Record<VersionHistoryItem["parseStatus"], string> = {
  success: "text-emerald-600",
  partial: "text-amber-600",
  failed: "text-rose-600",
};

export default function VersionHistoryList({ versions }: { versions: VersionHistoryItem[] }) {
  if (versions.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-slate-900">Riwayat Versi</h3>
      </div>
      <ul className="divide-y divide-slate-100">
        {versions.map((v) => (
          <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">
                Versi {v.versionNumber} · {v.originalFileName}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Diunggah oleh {v.uploadedBy} · {formatDateID(v.uploadedAt)}
              </p>
            </div>
            <span className={`shrink-0 text-xs font-medium ${PARSE_STATUS_COLOR[v.parseStatus]}`}>
              {PARSE_STATUS_LABEL[v.parseStatus]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
