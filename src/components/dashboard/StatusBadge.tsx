import { ManuscriptStatus } from "@/lib/types";
import { statusMeta } from "@/lib/status";

export default function StatusBadge({ status }: { status: ManuscriptStatus }) {
  const meta = statusMeta[status] ?? {
    label: status,
    dotClass: "bg-slate-400",
    badgeClass: "bg-slate-50 text-slate-700 ring-slate-600/20",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${meta.badgeClass}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} aria-hidden="true" />
      {meta.label}
    </span>
  );
}
