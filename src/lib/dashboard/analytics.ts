import { Manuscript, ManuscriptStatus } from "@/lib/types";
import { statusMeta } from "@/lib/status";

export interface StatusSlice {
  status: ManuscriptStatus;
  label: string;
  count: number;
  hexColor: string;
}

// Hex equivalents of the Tailwind dot colors already used in statusMeta, so
// the pie chart's segments stay visually consistent with StatusBadge/dots
// used everywhere else in the app rather than introducing a new palette.
const STATUS_HEX: Record<ManuscriptStatus, string> = {
  passed: "#10b981", // emerald-500
  needs_revision: "#f59e0b", // amber-500
  processing: "#0ea5e9", // sky-500
  processing_failed: "#f43f5e", // rose-500
};

const STATUS_ORDER: ManuscriptStatus[] = ["passed", "needs_revision", "processing", "processing_failed"];

export function statusDistribution(manuscripts: Manuscript[]): StatusSlice[] {
  return STATUS_ORDER.map((status) => ({
    status,
    label: statusMeta[status].label,
    count: manuscripts.filter((m) => m.status === status).length,
    hexColor: STATUS_HEX[status],
  })).filter((slice) => slice.count > 0);
}

export interface MonthBucket {
  key: string; // "2026-09"
  label: string; // "Sep 2026"
  count: number;
}

export function manuscriptsPerMonth(manuscripts: Manuscript[], monthsBack = 6): MonthBucket[] {
  const now = new Date();
  const buckets: MonthBucket[] = [];

  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = new Intl.DateTimeFormat("id-ID", { month: "short", year: "2-digit" }).format(d);
    buckets.push({ key, label, count: 0 });
  }

  const byKey = new Map(buckets.map((b) => [b.key, b]));

  for (const m of manuscripts) {
    const d = new Date(m.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const bucket = byKey.get(key);
    if (bucket) bucket.count += 1;
  }

  return buckets;
}

export interface UploaderCompliance {
  name: string;
  avgPercent: number;
  manuscriptCount: number;
}

export function complianceByUploader(manuscripts: Manuscript[]): UploaderCompliance[] {
  const screened = manuscripts.filter((m) => m.totalRulesChecked > 0);
  const byUploader = new Map<string, { total: number; passed: number; count: number }>();

  for (const m of screened) {
    const entry = byUploader.get(m.uploadedBy) ?? { total: 0, passed: 0, count: 0 };
    entry.total += m.totalRulesChecked;
    entry.passed += m.totalRulesPassed;
    entry.count += 1;
    byUploader.set(m.uploadedBy, entry);
  }

  return Array.from(byUploader.entries())
    .map(([name, { total, passed, count }]) => ({
      name,
      avgPercent: total === 0 ? 0 : Math.round((passed / total) * 100),
      manuscriptCount: count,
    }))
    .sort((a, b) => b.avgPercent - a.avgPercent);
}
