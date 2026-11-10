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
    <div className="fresh-card overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between border-b border-[#EFEAE4] bg-[#FAF8F5]/90 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#C13D0D]" aria-hidden="true" />
          <h3 className="text-sm font-bold text-stone-900">Riwayat Versi</h3>
        </div>
        <span className="text-xs font-semibold tabular-nums text-stone-500">{versions.length} versi</span>
      </div>
      <ul className="divide-y divide-[#EFEAE4]">
        {versions.map((v) => (
          <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-stone-900">
                Versi {v.versionNumber} · {v.originalFileName}
              </p>
              <p className="mt-0.5 text-xs text-stone-500">
                Diunggah oleh {v.uploadedBy} · {formatDateID(v.uploadedAt)}
              </p>
            </div>
            <span className={`shrink-0 text-xs font-semibold ${PARSE_STATUS_COLOR[v.parseStatus]}`}>
              {PARSE_STATUS_LABEL[v.parseStatus]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
