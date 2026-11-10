import { ManuscriptStatus } from "@/lib/types";
import { statusMeta } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function StatusBadge({ status }: { status: ManuscriptStatus }) {
  const meta = statusMeta[status] ?? {
    label: status,
    dotClass: "bg-slate-400",
    badgeClass: "bg-slate-50 text-slate-700 border-slate-200",
  };
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 rounded-full font-medium py-0.5 shadow-none", meta.badgeClass)}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dotClass)} aria-hidden="true" />
      {meta.label}
    </Badge>
  );
}
