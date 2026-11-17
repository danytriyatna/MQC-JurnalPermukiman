"use client";

import * as React from "react";
import Link from "next/link";
import { Manuscript } from "@/lib/types";
import { formatDateID, initialsOf } from "@/lib/status";
import StatusBadge from "./StatusBadge";
import ManuscriptRowActionDropdown from "./ManuscriptRowActionDropdown";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Checkbox } from "@/components/ui/checkbox";

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

interface PendingQueueTableProps {
  manuscripts: Manuscript[];
  selectedIds: string[];
  onToggleSelectAll: () => void;
  onToggleSelectOne: (id: string) => void;
  isAllSelected: boolean;
  processingIds: string[];
  deletingIds: string[];
  onScreenSingle: (id: string) => void;
  onDeleteSingle: (manuscript: Manuscript) => void;
}

export default function PendingQueueTable({
  manuscripts,
  selectedIds,
  onToggleSelectAll,
  onToggleSelectOne,
  isAllSelected,
  processingIds,
  deletingIds,
  onScreenSingle,
  onDeleteSingle,
}: PendingQueueTableProps) {
  const columns = React.useMemo<DataTableColumn<Manuscript>[]>(
    () => [
      {
        id: "select",
        header: () => (
          <Checkbox
            checked={isAllSelected}
            onCheckedChange={onToggleSelectAll}
            aria-label="Pilih Semua Naskah Pending"
          />
        ),
        className: "w-12 px-5 py-3.5",
        headerClassName: "w-12 px-5 py-3.5",
        cell: (manuscript) => (
          <Checkbox
            checked={selectedIds.includes(manuscript.id)}
            onCheckedChange={() => onToggleSelectOne(manuscript.id)}
            aria-label={`Pilih naskah ${manuscript.title}`}
          />
        ),
      },
      {
        id: "naskah",
        header: "Naskah",
        className: "max-w-xs px-5 py-4",
        headerClassName: "w-[35%] px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
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
        className: "whitespace-nowrap px-5 py-4",
        headerClassName: "px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
        cell: (manuscript) => <StatusBadge status={manuscript.status} />,
      },
      {
        id: "uploader",
        header: "Diunggah oleh",
        className: "whitespace-nowrap px-5 py-4",
        headerClassName: "px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
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
        id: "waktu",
        header: "Waktu Masuk",
        className: "whitespace-nowrap px-5 py-4 text-sm text-muted-foreground",
        headerClassName: "px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
        cell: (manuscript) => formatDateID(manuscript.updatedAt),
      },
      {
        id: "aksi",
        header: "Aksi Redaksi",
        className: "whitespace-nowrap px-5 py-4 text-right",
        headerClassName: "px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground",
        cell: (manuscript) => (
          <ManuscriptRowActionDropdown
            manuscript={manuscript}
            isProcessing={processingIds.includes(manuscript.id)}
            isDeleting={deletingIds.includes(manuscript.id)}
            onScreen={() => onScreenSingle(manuscript.id)}
            onDelete={() => onDeleteSingle(manuscript)}
          />
        ),
      },
    ],
    [
      isAllSelected,
      onToggleSelectAll,
      selectedIds,
      onToggleSelectOne,
      processingIds,
      deletingIds,
      onScreenSingle,
      onDeleteSingle,
    ]
  );

  return (
    <DataTable<Manuscript>
      columns={columns}
      data={manuscripts}
      searchKeys={["title", "originalFileName", "uploadedBy"]}
      searchPlaceholder="Cari naskah yang menunggu..."
      enableSearch={true}
      enablePagination={true}
      defaultPageSize={10}
      rowClassName={(m) =>
        selectedIds.includes(m.id) ? "bg-primary/5 hover:bg-primary/10" : ""
      }
      emptyMessage="Tidak ada naskah yang cocok dengan pencarian."
    />
  );
}
