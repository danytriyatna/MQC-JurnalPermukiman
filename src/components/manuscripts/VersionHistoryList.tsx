import { formatDateID } from "@/lib/status";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

const PARSE_STATUS_VARIANT: Record<
  VersionHistoryItem["parseStatus"],
  "success" | "warning" | "destructive"
> = {
  success: "success",
  partial: "warning",
  failed: "destructive",
};

export default function VersionHistoryList({ versions }: { versions: VersionHistoryItem[] }) {
  if (versions.length === 0) return null;

  return (
    <Card className="overflow-hidden shadow-sm">
      <CardHeader className="border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
        <CardTitle className="text-sm font-semibold text-slate-900">Riwayat Versi</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-slate-100">
          {versions.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">
                  Versi {v.versionNumber} · {v.originalFileName}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Diunggah oleh {v.uploadedBy} · {formatDateID(v.uploadedAt)}
                </p>
              </div>
              <Badge variant={PARSE_STATUS_VARIANT[v.parseStatus]} className="shrink-0 text-xs">
                {PARSE_STATUS_LABEL[v.parseStatus]}
              </Badge>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
