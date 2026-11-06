import { Manuscript } from "@/lib/types";
import { formatDateID, initialsOf } from "@/lib/status";
import StatusBadge from "./StatusBadge";

const AVATAR_PALETTE = [
  "bg-indigo-100 text-indigo-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
];

function avatarColorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[Math.abs(hash)];
}

function ComplianceCell({ manuscript }: { manuscript: Manuscript }) {
  if (manuscript.status === "processing" || manuscript.status === "pending") {
    return <span className="text-sm text-slate-400">Menunggu pemeriksaan</span>;
  }
  if (manuscript.status === "processing_failed") {
    return <span className="text-sm text-slate-400">Tidak dapat dianalisis</span>;
  }

  const { totalRulesChecked, totalRulesPassed, errorFindings, warningFindings } = manuscript;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium tabular-nums text-slate-900">
          {totalRulesPassed}/{totalRulesChecked}
        </span>
        <span className="text-xs text-slate-500">aturan terpenuhi</span>
      </div>
      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full w-full origin-left rounded-full transition-transform duration-500 ease-[var(--ease-out)] ${
            errorFindings > 0 ? "bg-amber-500" : "bg-emerald-500"
          }`}
          style={{
            transform: `scaleX(${totalRulesChecked === 0 ? 0 : totalRulesPassed / totalRulesChecked})`,
          }}
        />
      </div>
      {(errorFindings > 0 || warningFindings > 0) && (
        <div className="flex items-center gap-2 text-xs">
          {errorFindings > 0 && (
            <span className="text-rose-600">{errorFindings} wajib diperbaiki</span>
          )}
          {warningFindings > 0 && (
            <span className="text-amber-600">{warningFindings} disarankan</span>
          )}
        </div>
      )}
    </div>
  );
}

export default function ManuscriptHistoryTable({ manuscripts }: { manuscripts: Manuscript[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-slate-100">
              <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                Naskah
              </th>
              <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                Status
              </th>
              <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                Kepatuhan
              </th>
              <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                Diunggah oleh
              </th>
              <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                Diperbarui
              </th>
              <th scope="col" className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">
                <span className="sr-only">Aksi</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {manuscripts.map((manuscript) => (
              <tr key={manuscript.id} className="transition-colors duration-150 hover:bg-slate-50">
                <td className="max-w-xs px-5 py-4">
                  <a
                    href={`/manuscripts/${manuscript.id}`}
                    className="block truncate text-sm font-medium text-slate-900 transition-colors duration-150 hover:text-slate-700 hover:underline"
                    title={manuscript.title}
                  >
                    {manuscript.title}
                  </a>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {manuscript.originalFileName} · v{manuscript.versionNumber}
                  </p>
                </td>
                <td className="whitespace-nowrap px-5 py-4">
                  <StatusBadge status={manuscript.status} />
                </td>
                <td className="whitespace-nowrap px-5 py-4">
                  <ComplianceCell manuscript={manuscript} />
                </td>
                <td className="whitespace-nowrap px-5 py-4">
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold ${avatarColorFor(manuscript.uploadedBy)}`}
                    >
                      {initialsOf(manuscript.uploadedBy)}
                    </span>
                    <span className="text-sm text-slate-700">{manuscript.uploadedBy}</span>
                  </div>
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-500">
                  {formatDateID(manuscript.updatedAt)}
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-right">
                  <a
                    href={`/manuscripts/${manuscript.id}`}
                    className="text-sm font-medium text-slate-600 transition-colors duration-150 hover:text-slate-900"
                  >
                    Lihat detail
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
