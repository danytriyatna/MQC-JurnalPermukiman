import { Manuscript } from "@/lib/types";
import { formatDateID, initialsOf } from "@/lib/status";
import StatusBadge from "./StatusBadge";

const AVATAR_PALETTE = [
  "bg-[#FDF4F0] text-[#A0320A] ring-1 ring-[#F4D4C9]",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-800",
  "bg-stone-200 text-stone-700",
  "bg-orange-100 text-orange-800",
  "bg-rose-100 text-rose-700",
];

function avatarColorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[Math.abs(hash)];
}

function ComplianceCell({ manuscript }: { manuscript: Manuscript }) {
  if (manuscript.status === "processing") {
    return <span className="text-sm text-slate-400">—</span>;
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
      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-[#EFEAE4]">
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
    <div className="fresh-card overflow-hidden rounded-2xl border-t-[3px] border-t-[#C13D0D]">
      <div className="overflow-x-auto">
        <table className="w-full table-auto">
          <thead>
            <tr className="border-b border-[#EFEAE4] bg-[#FAF8F5]/80">
              <th scope="col" className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-stone-500">
                Naskah
              </th>
              <th scope="col" className="px-3.5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-stone-500">
                Status
              </th>
              <th scope="col" className="px-3.5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-stone-500">
                Kepatuhan
              </th>
              <th scope="col" className="px-3.5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-stone-500">
                Diunggah oleh
              </th>
              <th scope="col" className="px-3.5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-stone-500">
                Diperbarui
              </th>
              <th scope="col" className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-stone-500">
                <span className="sr-only">Aksi</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFEAE4]">
            {manuscripts.map((manuscript) => (
              <tr key={manuscript.id} className="group transition-colors duration-150 hover:bg-[#FDF9F6]">
                <td className="max-w-[260px] xl:max-w-[340px] 2xl:max-w-[560px] px-4 py-3.5">
                  <a
                    href={`/manuscripts/${manuscript.id}`}
                    className="block truncate text-sm font-semibold text-stone-900 transition-colors duration-150 group-hover:text-[#A0320A] hover:underline"
                    title={manuscript.title}
                  >
                    {manuscript.title}
                  </a>
                  <p className="mt-0.5 truncate text-xs text-stone-500">
                    {manuscript.originalFileName} · v{manuscript.versionNumber}
                  </p>
                </td>
                <td className="whitespace-nowrap px-3.5 py-3.5">
                  <StatusBadge status={manuscript.status} />
                </td>
                <td className="whitespace-nowrap px-3.5 py-3.5">
                  <ComplianceCell manuscript={manuscript} />
                </td>
                <td className="whitespace-nowrap px-3.5 py-3.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${avatarColorFor(manuscript.uploadedBy)}`}
                    >
                      {initialsOf(manuscript.uploadedBy)}
                    </span>
                    <span className="text-sm font-medium text-stone-700">{manuscript.uploadedBy}</span>
                  </div>
                </td>
                <td className="whitespace-nowrap px-3.5 py-3.5 text-xs sm:text-sm text-stone-500">
                  {formatDateID(manuscript.updatedAt)}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-right">
                  <a
                    href={`/manuscripts/${manuscript.id}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#F4D4C9] bg-[#FDF4F0] px-2.5 py-1 text-xs font-bold text-[#A0320A] transition-colors duration-150 hover:border-[#C13D0D] hover:bg-[#C13D0D] hover:text-white"
                  >
                    Lihat detail
                    <span aria-hidden="true">→</span>
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
