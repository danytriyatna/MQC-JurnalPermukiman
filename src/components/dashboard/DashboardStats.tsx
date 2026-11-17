import { Manuscript } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Clock, CheckCircle2, AlertTriangle } from "lucide-react";

function countBy(manuscripts: Manuscript[], status: Manuscript["status"]) {
  return manuscripts.filter((m) => m.status === status).length;
}

export default function DashboardStats({ manuscripts }: { manuscripts: Manuscript[] }) {
  const total = manuscripts.length;
  const pendingCount = countBy(manuscripts, "pending");
  const passedCount = countBy(manuscripts, "passed");
  const revisionCount = countBy(manuscripts, "needs_revision");

  const stats = [
    {
      label: "Total Naskah",
      value: total,
      subtext: "Semua naskah terdaftar",
      icon: FileText,
      badge: "Total",
      badgeVariant: "secondary" as const,
      iconColor: "text-slate-700 dark:text-slate-200",
      iconBg: "bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60",
    },
    {
      label: "Menunggu Pemeriksaan",
      value: pendingCount,
      subtext: total > 0 ? `${Math.round((pendingCount / total) * 100)}% dari total` : "0%",
      icon: Clock,
      badge: "Antrean",
      badgeVariant: "info" as const,
      iconColor: "text-blue-700 dark:text-blue-300",
      iconBg: "bg-blue-100 dark:bg-blue-950/60 border border-blue-200/80 dark:border-blue-800/50",
    },
    {
      label: "Lolos",
      value: passedCount,
      subtext: total > 0 ? `${Math.round((passedCount / total) * 100)}% dari total` : "0%",
      icon: CheckCircle2,
      badge: "Lolos",
      badgeVariant: "success" as const,
      iconColor: "text-emerald-700 dark:text-emerald-300",
      iconBg: "bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-200/80 dark:border-emerald-800/50",
    },
    {
      label: "Perlu Revisi",
      value: revisionCount,
      subtext: total > 0 ? `${Math.round((revisionCount / total) * 100)}% dari total` : "0%",
      icon: AlertTriangle,
      badge: "Revisi",
      badgeVariant: "warning" as const,
      iconColor: "text-amber-700 dark:text-amber-300",
      iconBg: "bg-amber-100 dark:bg-amber-950/60 border border-amber-200/80 dark:border-amber-800/50",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map(({ label, value, subtext, icon: Icon, badge, badgeVariant, iconBg, iconColor }) => (
        <Card
          key={label}
          className="transition-all duration-200 hover:shadow-md"
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{label}</span>
              <Badge variant={badgeVariant} className="text-[10px] px-1.5 py-0 h-4">
                {badge}
              </Badge>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold tabular-nums text-foreground">{value}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{subtext}</div>
              </div>
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
                <Icon className={`h-5 w-5 ${iconColor}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
