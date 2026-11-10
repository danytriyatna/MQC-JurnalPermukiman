import Link from "next/link";
import { Manuscript } from "@/lib/types";
import { formatDateID, initialsOf } from "@/lib/status";
import StatusBadge from "./StatusBadge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";

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
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) % AVATAR_PALETTE.length;
  }
  return AVATAR_PALETTE[Math.abs(hash)];
}

function ComplianceCell({ manuscript }: { manuscript: Manuscript }) {
  if (manuscript.status === "processing" || manuscript.status === "pending") {
    return <span className="text-sm text-muted-foreground">Menunggu pemeriksaan</span>;
  }
  if (manuscript.status === "processing_failed") {
    return <span className="text-sm text-muted-foreground">Tidak dapat dianalisis</span>;
  }

  const { totalRulesChecked, totalRulesPassed, errorFindings, warningFindings } = manuscript;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium tabular-nums text-slate-900">
          {totalRulesPassed}/{totalRulesChecked}
        </span>
        <span className="text-xs text-muted-foreground">aturan terpenuhi</span>
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

const manuscriptColumns: DataTableColumn<Manuscript>[] = [
  {
    id: "naskah",
    header: "Naskah",
    className: "max-w-xs",
    headerClassName: "w-[35%]",
    cell: (manuscript) => (
      <div>
        <Link
          href={`/manuscripts/${manuscript.id}`}
          className="block truncate text-sm font-medium text-slate-900 transition-colors hover:text-primary hover:underline"
          title={manuscript.title}
        >
          {manuscript.title}
        </Link>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {manuscript.originalFileName} · v{manuscript.versionNumber}
        </p>
      </div>
    ),
  },
  {
    id: "status",
    header: "Status",
    className: "whitespace-nowrap",
    cell: (manuscript) => <StatusBadge status={manuscript.status} />,
  },
  {
    id: "kepatuhan",
    header: "Kepatuhan",
    className: "whitespace-nowrap",
    cell: (manuscript) => <ComplianceCell manuscript={manuscript} />,
  },
  {
    id: "uploader",
    header: "Diunggah oleh",
    className: "whitespace-nowrap",
    cell: (manuscript) => (
      <div className="flex items-center gap-2">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold ${avatarColorFor(
            manuscript.uploadedBy
          )}`}
        >
          {initialsOf(manuscript.uploadedBy)}
        </span>
        <span className="text-sm text-slate-700">{manuscript.uploadedBy}</span>
      </div>
    ),
  },
  {
    id: "diperbarui",
    header: "Diperbarui",
    className: "whitespace-nowrap text-sm text-muted-foreground",
    cell: (manuscript) => formatDateID(manuscript.updatedAt),
  },
  {
    id: "aksi",
    header: <span className="sr-only">Aksi</span>,
    className: "whitespace-nowrap text-right",
    headerClassName: "text-right",
    cell: (manuscript) => (
      <Link
        href={`/manuscripts/${manuscript.id}`}
        className="text-xs font-semibold text-primary transition-colors hover:text-primary/80 hover:underline"
      >
        Lihat detail
      </Link>
    ),
  },
];

interface ManuscriptHistoryTableProps {
  manuscripts: Manuscript[];
  enableSearch?: boolean;
  enablePagination?: boolean;
  defaultPageSize?: number;
  isLoading?: boolean;
}

export default function ManuscriptHistoryTable({
  manuscripts,
  enableSearch = false,
  enablePagination = true,
  defaultPageSize = 10,
  isLoading = false,
}: ManuscriptHistoryTableProps) {
  return (
    <DataTable<Manuscript>
      columns={manuscriptColumns}
      data={manuscripts}
      searchKeys={["title", "originalFileName", "uploadedBy"]}
      searchPlaceholder="Cari judul, file, atau pengunggah..."
      enableSearch={enableSearch}
      enablePagination={enablePagination}
      defaultPageSize={defaultPageSize}
      isLoading={isLoading}
      emptyMessage="Tidak ada naskah yang cocok dengan filter atau pencarian."
    />
  );
}
