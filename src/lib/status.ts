import { ManuscriptStatus } from "./types";

export const statusMeta: Record<
  ManuscriptStatus,
  { label: string; dotClass: string; badgeClass: string }
> = {
  pending: {
    label: "Menunggu Pemeriksaan",
    dotClass: "bg-blue-500",
    badgeClass: "bg-blue-50 text-blue-700 ring-blue-600/20",
  },
  passed: {
    label: "Lolos",
    dotClass: "bg-emerald-500",
    badgeClass: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  },
  needs_revision: {
    label: "Perlu Revisi",
    dotClass: "bg-amber-500",
    badgeClass: "bg-amber-50 text-amber-700 ring-amber-600/20",
  },
  processing: {
    label: "Sedang Diproses",
    dotClass: "bg-sky-500",
    badgeClass: "bg-sky-50 text-sky-700 ring-sky-600/20",
  },
  processing_failed: {
    label: "Gagal Diproses",
    dotClass: "bg-rose-500",
    badgeClass: "bg-rose-50 text-rose-700 ring-rose-600/20",
  },
};

export function formatDateID(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function initialsOf(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
